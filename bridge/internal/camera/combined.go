package camera

// The combined still: the three straightened stills blended, each region taken from the
// camera that sees it sharpest.
//
// Board Manager's calibration gives, per camera, where four board points lie in that camera's
// raw image: the outer double wire (r = 1) at 81°, −9°, −99° and 171° (y up). From them a
// homography G maps the board into the camera's image; |det J_G| at a board point is how many
// camera pixels cover a board unit² there, i.e. how sharply that camera sees it (0 where it
// falls outside the camera's image). Each camera's weight at a pixel is (d / d of that pixel's
// sharpest camera)^4, normalised over the cameras that have a still. The weights only depend on the calibration, so they are computed once
// per calibration and still size.

import (
	"encoding/json"
	"errors"
	"image"
	"image/draw"
	"math"
)

// CombinedCam is the camera number of the combined still (after Cam 1–3).
const CombinedCam = MaxCameras

// weightPower sharpens the choice of camera: a camera seeing a region half as sharply gets 1/16 of its say.
const weightPower = 4

// Calibration is the part of Board Manager's /api/config the bridge keeps: the calibration
// points (normalised to the raw image) and the raw image size. Nothing else is read.
type Calibration struct {
	Points [MaxCameras][4][2]float64
	Have   [MaxCameras]bool
	Width  float64
	Height float64
}

// ParseCalibration reads the calibration out of a Board Manager /api/config body.
func ParseCalibration(body []byte) (Calibration, error) {
	// Only these fields are decoded; everything else in the config (auth, …) is skipped
	var raw struct {
		Calibration map[string][][2]float64 `json:"calibration"`
		Cam         struct {
			Width  float64 `json:"width"`
			Height float64 `json:"height"`
		} `json:"cam"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return Calibration{}, err
	}
	if raw.Cam.Width <= 0 || raw.Cam.Height <= 0 {
		return Calibration{}, errors.New("config has no camera size")
	}
	cal := Calibration{Width: raw.Cam.Width, Height: raw.Cam.Height}
	for i, key := range []string{"0", "1", "2"} {
		pts := raw.Calibration[key]
		if len(pts) != 4 {
			continue
		}
		copy(cal.Points[i][:], pts)
		cal.Have[i] = true
	}
	if cal.cameras() == 0 {
		return Calibration{}, errors.New("config has no calibration")
	}
	return cal, nil
}

func (c Calibration) cameras() int {
	n := 0
	for _, h := range c.Have {
		if h {
			n++
		}
	}
	return n
}

// boardPoints are the four calibration points on the board: r = 1 at 81°, −9°, −99°, 171°.
func boardPoints() [4][2]float64 {
	var p [4][2]float64
	for k, deg := range []float64{81, -9, -99, 171} {
		a := deg * math.Pi / 180
		p[k] = [2]float64{math.Cos(a), math.Sin(a)}
	}
	return p
}

// homography maps board units (y up) into camera i's raw image pixels.
func (c Calibration) homography(i int) ([9]float64, bool) {
	var dst [4][2]float64
	for k, p := range c.Points[i] {
		dst[k] = [2]float64{p[0] * c.Width, p[1] * c.Height}
	}
	return homography(boardPoints(), dst)
}

// homography solves the 3×3 projective map (h[8] = 1) taking src[k] to dst[k].
func homography(src, dst [4][2]float64) ([9]float64, bool) {
	var a [8][9]float64 // augmented 8×8 system
	for k := 0; k < 4; k++ {
		x, y, u, v := src[k][0], src[k][1], dst[k][0], dst[k][1]
		a[2*k] = [9]float64{x, y, 1, 0, 0, 0, -u * x, -u * y, u}
		a[2*k+1] = [9]float64{0, 0, 0, x, y, 1, -v * x, -v * y, v}
	}
	for col := 0; col < 8; col++ {
		pivot := col
		for r := col + 1; r < 8; r++ {
			if math.Abs(a[r][col]) > math.Abs(a[pivot][col]) {
				pivot = r
			}
		}
		if math.Abs(a[pivot][col]) < 1e-12 {
			return [9]float64{}, false
		}
		a[col], a[pivot] = a[pivot], a[col]
		for r := col + 1; r < 8; r++ {
			f := a[r][col] / a[col][col]
			for c := col; c < 9; c++ {
				a[r][c] -= f * a[col][c]
			}
		}
	}
	var h [9]float64
	for r := 7; r >= 0; r-- {
		s := a[r][8]
		for c := r + 1; c < 8; c++ {
			s -= a[r][c] * h[c]
		}
		h[r] = s / a[r][r]
	}
	h[8] = 1
	return h, true
}

func apply(h [9]float64, x, y float64) (float64, float64) {
	w := h[6]*x + h[7]*y + h[8]
	return (h[0]*x + h[1]*y + h[2]) / w, (h[3]*x + h[4]*y + h[5]) / w
}

// density is |det J| of h at board point (x, y): image pixels per board unit², or 0 where the
// point falls outside the w×hgt image.
func density(h [9]float64, x, y, w, hgt float64) float64 {
	const e = 1e-3
	x0, y0 := apply(h, x, y)
	if !(x0 >= 0 && x0 < w && y0 >= 0 && y0 < hgt) {
		return 0
	}
	x1, y1 := apply(h, x+e, y)
	x2, y2 := apply(h, x, y+e)
	return math.Abs((x1-x0)*(y2-y0)-(x2-x0)*(y1-y0)) / (e * e)
}

// Maps holds each camera's weight per pixel of a size×size still, row by row: (d / the pixel's
// highest d)^4, so the sharpest camera there has 1; not yet normalised over the cameras (that
// depends on which have a still).
type Maps [MaxCameras][]float32

// Weights computes the weight maps for size×size stills (r = 1 at a third of the width); nil
// when no camera sees the board.
func Weights(cal Calibration, size int) *Maps {
	var dens [MaxCameras][]float64
	scale := float64(size) / 3
	for i := 0; i < MaxCameras; i++ {
		if !cal.Have[i] {
			continue
		}
		h, ok := cal.homography(i)
		if !ok {
			continue
		}
		dens[i] = make([]float64, size*size)
		for v := 0; v < size; v++ {
			by := -(float64(v) - float64(size)/2) / scale
			for u := 0; u < size; u++ {
				bx := (float64(u) - float64(size)/2) / scale
				dens[i][v*size+u] = density(h, bx, by, cal.Width, cal.Height)
			}
		}
	}
	return weightsFromDensities(dens)
}

// weightsFromDensities turns per-camera densities (nil: camera not calibrated) into weights
// relative to each pixel's sharpest camera, so no density elsewhere can push a pixel to 0; nil
// when no camera sees any pixel.
func weightsFromDensities(dens [MaxCameras][]float64) *Maps {
	n := 0
	for _, d := range dens {
		n = max(n, len(d))
	}
	var m Maps
	seen := false
	for i := range m {
		m[i] = make([]float32, n)
	}
	for p := 0; p < n; p++ {
		top := 0.0
		for _, d := range dens {
			if p < len(d) {
				top = math.Max(top, d[p])
			}
		}
		if top == 0 {
			continue
		}
		seen = true
		for i, d := range dens {
			if p < len(d) && d[p] > 0 {
				m[i][p] = float32(math.Pow(d[p]/top, weightPower))
			}
		}
	}
	if !seen {
		return nil
	}
	return &m
}

func (m *Maps) size() int { return int(math.Round(math.Sqrt(float64(len(m[0]))))) }

// normalised is pixel p's weights over the cameras present, summing to 1 (all 0 where none sees it).
func normalised(m *Maps, p int, present [MaxCameras]bool) [MaxCameras]float64 {
	var w [MaxCameras]float64
	sum := 0.0
	for i := range m {
		if present[i] {
			w[i] = float64(m[i][p])
			sum += w[i]
		}
	}
	if sum == 0 {
		return [MaxCameras]float64{}
	}
	for i := range w {
		w[i] /= sum
	}
	return w
}

// Blend mixes the stills (nil: that camera has none) by the weight maps. Stills must be the
// maps' size; another size counts as missing. Pixels no present camera sees are black.
func Blend(m *Maps, stills [MaxCameras]image.Image) *image.RGBA {
	size := m.size()
	rect := image.Rect(0, 0, size, size)
	var px [MaxCameras]*image.RGBA
	var present [MaxCameras]bool
	for i, s := range stills {
		if s == nil || s.Bounds().Dx() != size || s.Bounds().Dy() != size {
			continue
		}
		rgba := image.NewRGBA(rect)
		draw.Draw(rgba, rect, s, s.Bounds().Min, draw.Src)
		px[i], present[i] = rgba, true
	}
	out := image.NewRGBA(rect)
	for p := 0; p < size*size; p++ {
		w := normalised(m, p, present)
		var r, g, b float64
		for i := range w {
			if w[i] == 0 {
				continue
			}
			o := p * 4
			r += w[i] * float64(px[i].Pix[o])
			g += w[i] * float64(px[i].Pix[o+1])
			b += w[i] * float64(px[i].Pix[o+2])
		}
		o := p * 4
		out.Pix[o], out.Pix[o+1], out.Pix[o+2], out.Pix[o+3] = clamp(r), clamp(g), clamp(b), 255
	}
	return out
}

func clamp(v float64) uint8 {
	return uint8(math.Min(255, math.Max(0, math.Round(v))))
}
