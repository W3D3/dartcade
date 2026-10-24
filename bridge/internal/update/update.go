// Package update lets an installed bridge update itself to an official release (bridge.update).
//
// Stage downloads the release's SHA256SUMS, its signature and the binary for this OS and arch
// into <state dir>/update, checks the signature against the keys built into the bridge and the
// binary against its checksum, and runs it once to see that it reports the requested version.
// Apply installs a staged binary over the running one: in the bridge itself where it may write
// its executable (macOS runs it as root; on Windows it runs from its state dir), and on Linux in
// the unit's ExecStopPost, as root, after the hardened bridge exited (service.go).
package update

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	_ "embed"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// release.pub holds the public half of the key the release workflow signs SHA256SUMS with
// (BRIDGE_SIGNING_KEY). A signature by any key in it counts: to rotate, add the new key a
// release before signing with it, and drop the old one later.
//
//go:embed release.pub
var releasePub []byte

// releaseBase is where the official releases are; only tests point it elsewhere.
var releaseBase = "https://github.com/W3D3/dartcade/releases/download/"

const (
	sumsName = "SHA256SUMS"
	sigName  = sumsName + ".sig"
	// What Apply installs: the tag of the staged release, written once it is verified
	readyName = "ready"
	maxBinary = 128 << 20
	maxSmall  = 64 << 10
)

// The staged binary; Windows runs only what ends in .exe
var binName = "dartcade-bridge.new" + exeSuffix()

func exeSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

// Tag is a release version, vMAJOR.MINOR.PATCH.
type Tag [3]int

var tagRe = regexp.MustCompile(`^v(\d{1,6})\.(\d{1,6})\.(\d{1,6})$`)

// ParseTag accepts only a plain release tag such as v0.9.2 (no dev builds, no prereleases).
func ParseTag(s string) (Tag, bool) {
	m := tagRe.FindStringSubmatch(s)
	if m == nil {
		return Tag{}, false
	}
	var t Tag
	for i := range t {
		t[i], _ = strconv.Atoi(m[i+1])
	}
	return t, true
}

func (t Tag) String() string { return fmt.Sprintf("v%d.%d.%d", t[0], t[1], t[2]) }

// Newer reports whether t is a later release than o.
func (t Tag) Newer(o Tag) bool {
	for i := range t {
		if t[i] != o[i] {
			return t[i] > o[i]
		}
	}
	return false
}

// AssetName is the release asset built for this OS and arch (.github/workflows/release.yml).
func AssetName() string {
	return "dartcade-bridge_" + runtime.GOOS + "_" + runtime.GOARCH + exeSuffix()
}

// Dir is where a bridge with this state dir stages its updates.
func Dir(stateDir string) string { return filepath.Join(stateDir, "update") }

// Phase reports how far Stage got (BridgeUpdateStatusData.phase).
type Phase string

const (
	Downloading Phase = "downloading"
	Verifying   Phase = "verifying"
	Installing  Phase = "installing"
)

// Stage downloads and verifies the release tag into dir, replacing whatever was staged there.
// It refuses a tag that isn't newer than current. On success dir holds a ready update.
func Stage(ctx context.Context, dir string, current, tag Tag, report func(Phase)) error {
	if !tag.Newer(current) {
		return fmt.Errorf("%s is not newer than this bridge (%s)", tag, current)
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	report(Downloading)
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	for _, f := range []struct {
		name, asset string
		max         int64
	}{{sumsName, sumsName, maxSmall}, {sigName, sigName, maxSmall}, {binName, AssetName(), maxBinary}} {
		if err := download(ctx, releaseBase+tag.String()+"/"+f.asset, filepath.Join(dir, f.name), f.max); err != nil {
			return fmt.Errorf("download %s: %w", f.asset, err)
		}
	}
	report(Verifying)
	if err := verify(dir, filepath.Join(dir, binName), tag); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, readyName), []byte(tag.String()), 0o600)
}

// Staged is the tag of the update staged in dir, if one is ready.
func Staged(dir string) (Tag, bool) {
	b, err := readRegular(filepath.Join(dir, readyName), maxSmall)
	if err != nil {
		return Tag{}, false
	}
	return ParseTag(string(b))
}

// Apply installs the update staged in dir over target, the bridge's executable, which is
// release current. It does nothing without a ready update. It re-verifies the copy it installs
// and refuses one that isn't newer, because on Linux it runs as root and dir belongs to the
// bridge's unprivileged user (which could stage an older, correctly signed release). On an
// error target is unchanged.
func Apply(dir, target string, current Tag) error {
	tag, ok := Staged(dir)
	if !ok {
		return nil
	}
	// Consumed first: an update that fails here is never retried on the next stop
	defer os.RemoveAll(dir)
	if !tag.Newer(current) {
		return fmt.Errorf("%s is not newer than this bridge (%s)", tag, current)
	}
	tmp := strings.TrimSuffix(target, exeSuffix()) + ".new" + exeSuffix()
	if err := copyStaged(filepath.Join(dir, binName), tmp); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := verify(dir, tmp, tag); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := replace(tmp, target); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// Cleanup removes what an earlier update left beside target (Windows can't delete a running
// executable, so the old one is renamed away and removed on the next start).
func Cleanup(target string) { os.Remove(target + ".old") }

// replace swaps src in for dst. A running executable can be renamed on every OS, but only
// Unix lets a rename land on top of it.
func replace(src, dst string) error {
	if runtime.GOOS != "windows" {
		return os.Rename(src, dst)
	}
	old := dst + ".old"
	os.Remove(old)
	if err := os.Rename(dst, old); err != nil {
		return err
	}
	if err := renameRetrying(src, dst); err != nil {
		if rerr := renameRetrying(old, dst); rerr != nil {
			return fmt.Errorf("%w; and putting the old bridge back failed too (%v): run the install command again", err, rerr)
		}
		return err
	}
	return nil
}

// renameRetrying renames, retrying for about two seconds: on Windows a virus scanner or the
// indexer often holds a file it just saw written.
func renameRetrying(src, dst string) error {
	var err error
	for range 5 {
		if err = os.Rename(src, dst); err == nil {
			return nil
		}
		time.Sleep(400 * time.Millisecond)
	}
	return err
}

// verify checks dir's SHA256SUMS against a release key, bin against its line for this
// platform, and that bin runs and reports tag (so an older signed release can't pass as tag).
func verify(dir, bin string, tag Tag) error {
	sums, err := readRegular(filepath.Join(dir, sumsName), maxSmall)
	if err != nil {
		return err
	}
	sig, err := readRegular(filepath.Join(dir, sigName), maxSmall)
	if err != nil {
		return err
	}
	if err := checkSignature(sums, sig); err != nil {
		return err
	}
	want, ok := sumFor(sums, AssetName())
	if !ok {
		return fmt.Errorf("%s has no checksum for %s", sumsName, AssetName())
	}
	got, err := fileSHA256(bin)
	if err != nil {
		return err
	}
	if got != want {
		return fmt.Errorf("checksum mismatch for %s", AssetName())
	}
	return checkVersion(bin, tag)
}

func checkSignature(msg, sig []byte) error {
	rest, keys := releasePub, 0
	for {
		var block *pem.Block
		if block, rest = pem.Decode(rest); block == nil {
			break
		}
		key, err := x509.ParsePKIXPublicKey(block.Bytes)
		pub, ok := key.(ed25519.PublicKey)
		if err != nil || !ok {
			return errors.New("a built-in release key is not an ed25519 key")
		}
		keys++
		if ed25519.Verify(pub, msg, sig) {
			return nil
		}
	}
	if keys == 0 {
		return errors.New("no release key built in")
	}
	return fmt.Errorf("%s is not signed by the dartcade release key", sumsName)
}

// sumFor finds name's hash in sha256sum output ("<hex>  <name>", or " *<name>" in binary mode).
func sumFor(sums []byte, name string) (string, bool) {
	for _, line := range strings.Split(string(sums), "\n") {
		hash, file, ok := strings.Cut(strings.TrimSpace(line), " ")
		if ok && strings.TrimLeft(file, " *") == name && len(hash) == 64 {
			return strings.ToLower(hash), true
		}
	}
	return "", false
}

func checkVersion(bin string, tag Tag) error {
	if err := os.Chmod(bin, 0o755); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, "version").Output()
	if err != nil {
		return fmt.Errorf("the new bridge does not run here: %w", err)
	}
	if v := strings.TrimSpace(string(out)); v != tag.String() {
		return fmt.Errorf("the new bridge reports %q, not %s", v, tag)
	}
	return nil
}

func download(ctx context.Context, url, path string, max int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s answered %s", url, res.Status)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	n, err := io.Copy(f, io.LimitReader(res.Body, max+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && n > max {
		err = fmt.Errorf("larger than %d bytes", max)
	}
	return err
}

// readRegular reads a regular file (never a symlink, a FIFO or a device: Apply reads files
// the unprivileged bridge wrote) of at most max bytes.
func readRegular(path string, max int64) ([]byte, error) {
	f, err := openRegular(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var b bytes.Buffer
	if _, err := io.Copy(&b, io.LimitReader(f, max+1)); err != nil {
		return nil, err
	}
	if int64(b.Len()) > max {
		return nil, fmt.Errorf("%s is larger than %d bytes", path, max)
	}
	return b.Bytes(), nil
}

func openRegular(path string) (*os.File, error) {
	fi, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("%s is not a regular file", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	// The file opened must be the one checked, not one swapped in between
	if opened, err := f.Stat(); err != nil || !os.SameFile(fi, opened) {
		f.Close()
		return nil, fmt.Errorf("%s changed while it was opened", path)
	}
	return f, nil
}

func copyStaged(src, dst string) error {
	in, err := openRegular(src)
	if err != nil {
		return err
	}
	defer in.Close()
	os.Remove(dst)
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, io.LimitReader(in, maxBinary))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	return err
}

func fileSHA256(path string) (string, error) {
	f, err := openRegular(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
