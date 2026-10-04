package camera

import (
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"math"
	"strings"
	"testing"
)

// A board that each camera sees as an affine image: board (x, y) → (ax·x + cx, ay·y + cy).
func affineCal(t *testing.T, w, h float64, cams ...[4]float64) Calibration {
	t.Helper()
	var cal Calibration
	cal.Width, cal.Height = w, h
	for i, c := range cams {
		ax, ay, cx, cy := c[0], c[1], c[2], c[3]
		for k, p := range boardPoints() {
			cal.Points[i][k] = [2]float64{(ax*p[0] + cx) / w, (ay*p[1] + cy) / h}
		}
		cal.Have[i] = true
	}
	return cal
}

func near(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

func TestHomographyMapsTheFourPointsAndInterpolatesAnAffineMap(t *testing.T) {
	src := boardPoints()
	var dst [4][2]float64
	for k, p := range src {
		dst[k] = [2]float64{2*p[0] + 10, 3*p[1] + 20}
	}
	h, ok := homography(src, dst)
	if !ok {
		t.Fatal("singular")
	}
	for k := range src {
		x, y := apply(h, src[k][0], src[k][1])
		if !near(x, dst[k][0], 1e-9) || !near(y, dst[k][1], 1e-9) {
			t.Errorf("point %d → (%v, %v), want %v", k, x, y, dst[k])
		}
	}
	// Any other point follows the same affine map
	x, y := apply(h, 0.3, -0.7)
	if !near(x, 10.6, 1e-9) || !near(y, 17.9, 1e-9) {
		t.Errorf("(0.3, -0.7) → (%v, %v), want (10.6, 17.9)", x, y)
	}
	// Image pixels per board unit²: 2 × 3, everywhere inside the image
	if d := density(h, 0.1, 0.2, 100, 100); !near(d, 6, 1e-3) {
		t.Errorf("density %v, want 6", d)
	}
	// Outside the image (x = 2·5 + 10 = 20 ≥ width 15): no density
	if d := density(h, 5, 0, 15, 100); d != 0 {
		t.Errorf("density outside the image %v, want 0", d)
	}
}

func TestDensityOfAPerspectiveGrowsTowardsTheCamera(t *testing.T) {
	// The real board's calibration (fixtures): each camera sees the board sharper on its own side
	cal, err := ParseCalibration([]byte(realConfig))
	if err != nil {
		t.Fatal(err)
	}
	h, ok := cal.homography(0)
	if !ok {
		t.Fatal("singular")
	}
	// The calibration points map exactly
	for k, p := range boardPoints() {
		x, y := apply(h, p[0], p[1])
		if !near(x, cal.Points[0][k][0]*1280, 1e-6) || !near(y, cal.Points[0][k][1]*720, 1e-6) {
			t.Errorf("cam 0 point %d → (%v, %v)", k, x, y)
		}
	}
	if d := density(h, 0, 0, 1280, 720); d <= 0 {
		t.Errorf("density at the bull %v, want > 0", d)
	}
}

func TestWeightsNormaliseAndFavourTheSharperCamera(t *testing.T) {
	// Cam 0 sees the board at 100 px per unit, cam 1 at 50: both see all of it
	cal := affineCal(t, 1000, 1000, [4]float64{100, 100, 500, 500}, [4]float64{50, 50, 500, 500})
	w := Weights(cal, 30)
	if w == nil {
		t.Fatal("no weights")
	}
	p := 15*30 + 15 // the bull
	// d0 = 10000, d1 = 2500: (d/max)^4 = 1 and 1/256
	if !near(float64(w[0][p]), 1, 1e-6) || !near(float64(w[1][p]), 1.0/256, 1e-6) || w[2][p] != 0 {
		t.Errorf("weights at the bull: %v %v %v", w[0][p], w[1][p], w[2][p])
	}
	n := normalised(w, p, [3]bool{true, true, true})
	if !near(n[0]+n[1]+n[2], 1, 1e-6) || n[0] < n[1] {
		t.Errorf("normalised %v", n)
	}
}

func TestAnExtremeDensityElsewhereChangesNoOtherPixel(t *testing.T) {
	const n = 4
	var dens [MaxCameras][]float64
	for i := range dens {
		dens[i] = []float64{100, 50, 0, 7}
	}
	dens[1] = []float64{50, 100, 30, 0}
	before := weightsFromDensities(dens)
	dens[0][3] = 1e300 // one absurd pixel
	after := weightsFromDensities(dens)
	for p := 0; p < n-1; p++ {
		for i := 0; i < MaxCameras; i++ {
			if before[i][p] != after[i][p] {
				t.Errorf("pixel %d cam %d: %v → %v", p, i, before[i][p], after[i][p])
			}
		}
	}
	// Pixel 2: only cameras 1 (30) and 2 (0) — camera 1 has it all, nothing underflows to black
	if after[1][2] != 1 || after[0][2] != 0 {
		t.Errorf("pixel 2: %v %v", after[0][2], after[1][2])
	}
	if after[0][3] != 1 {
		t.Errorf("the absurd pixel: cam 0 %v", after[0][3])
	}
}

func TestAPixelOutsideACameraGetsNoWeightFromIt(t *testing.T) {
	// Cam 1 sees the board shifted right: board x > 0.8 falls off its 1000-px-wide image
	cal := affineCal(t, 1000, 1000, [4]float64{100, 100, 500, 500}, [4]float64{100, 100, 920, 500})
	w := Weights(cal, 30)
	right := 15*30 + 25 // board x = (25 − 15)/10 = 1.0
	left := 15*30 + 5   // board x = −1.0
	if w[1][right] != 0 {
		t.Errorf("cam 1 weight off its image: %v", w[1][right])
	}
	if w[1][left] == 0 || w[0][right] == 0 {
		t.Errorf("weights where the cameras see the board: cam1 left %v, cam0 right %v", w[1][left], w[0][right])
	}
	n := normalised(w, right, [3]bool{true, true, true})
	if n[0] != 1 || n[1] != 0 {
		t.Errorf("normalised off cam 1: %v", n)
	}
}

func TestBlendFollowsTheWeights(t *testing.T) {
	const size = 30
	// Cam 0 sharp on the left (x < 0), cam 1 sharp on the right, by scaling each camera's view
	cal := affineCal(t, 1e6, 1e6, [4]float64{100, 100, 5e5, 5e5}, [4]float64{100, 100, 5e5, 5e5})
	w := Weights(cal, size)
	// Doctor the maps: left half all cam 0, right half 1:1, one pixel nobody sees
	for p := range w[0] {
		if p%size < size/2 {
			w[0][p], w[1][p] = 1, 0
		} else {
			w[0][p], w[1][p] = 0.5, 0.5
		}
	}
	w[0][0], w[1][0] = 0, 0
	solid := func(c color.RGBA) image.Image {
		img := image.NewRGBA(image.Rect(0, 0, size, size))
		for i := 0; i < len(img.Pix); i += 4 {
			img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = c.R, c.G, c.B, 255
		}
		return img
	}
	out := Blend(w, [3]image.Image{solid(color.RGBA{200, 0, 0, 255}), solid(color.RGBA{0, 100, 0, 255}), nil})
	if c := out.RGBAAt(3, 10); c != (color.RGBA{200, 0, 0, 255}) {
		t.Errorf("left: %v", c)
	}
	if c := out.RGBAAt(25, 10); c != (color.RGBA{100, 50, 0, 255}) {
		t.Errorf("right: %v", c)
	}
	if c := out.RGBAAt(0, 0); c != (color.RGBA{0, 0, 0, 255}) {
		t.Errorf("unseen: %v", c)
	}
	// Cam 1 missing: its share goes to cam 0
	out = Blend(w, [3]image.Image{solid(color.RGBA{200, 0, 0, 255}), nil, nil})
	if c := out.RGBAAt(25, 10); c != (color.RGBA{200, 0, 0, 255}) {
		t.Errorf("right without cam 1: %v", c)
	}
}

func TestParseCalibrationKeepsOnlyCalibrationAndCameraSize(t *testing.T) {
	cal, err := ParseCalibration([]byte(realConfig))
	if err != nil {
		t.Fatal(err)
	}
	if cal.Width != 1280 || cal.Height != 720 || !cal.Have[0] || !cal.Have[1] || !cal.Have[2] {
		t.Fatalf("calibration: %+v", cal)
	}
	if cal.Points[1][0] != [2]float64{0.796439973105881, 0.37783946861645124} {
		t.Errorf("cam 1 point 0: %v", cal.Points[1][0])
	}
	// Nothing else survives: not in the value, not when printed or marshalled
	b, _ := json.Marshal(cal)
	for _, s := range []string{string(b), fmt.Sprintf("%+v", cal)} {
		for _, secret := range []string{"sekrit-key", "board-id-123", "auth", "api_key", "host"} {
			if strings.Contains(s, secret) {
				t.Errorf("%q kept: %s", secret, s)
			}
		}
	}
}

func TestParseCalibrationWithoutCalibration(t *testing.T) {
	if _, err := ParseCalibration([]byte(`{"auth":{"api_key":"x"},"cam":{"width":1280,"height":720}}`)); err == nil {
		t.Error("want an error without calibration")
	}
	if _, err := ParseCalibration([]byte(`{"calibration":{"0":[[0,0],[1,0],[1,1],[0,1]]}}`)); err == nil {
		t.Error("want an error without the camera size")
	}
}

const realConfig = `{
 "auth": {"api_key": "sekrit-key", "board_id": "board-id-123"},
 "host": {"port": "3180"},
 "cam": {"cams": ["/dev/video0","/dev/video2","/dev/video4"], "width": 1280, "height": 720, "rotate_180": [true, true, false]},
 "calibration": {
  "0": [[0.4738207433402457, 0.2330284423154376], [0.7344383349580615, 0.31419304598259784], [0.655486466761338, 0.7109727758329021], [0.29618799524022227, 0.5115152951703709]],
  "1": [[0.796439973105881, 0.37783946861645124], [0.49758568198028197, 0.6782469879755438], [0.32694472420766596, 0.29786782631864234], [0.5763573152494715, 0.1507878705990368]],
  "2": [[0.31855918707882386, 0.7137162715672337], [0.3597120556678253, 0.32194602619989754], [0.6382643291068371, 0.296418974510434], [0.7471338782139296, 0.6508657842537231]]
 }
}`
