package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// release serves a signed release of tag whose binary is a script printing reports.
type release struct {
	files map[string][]byte
	key   ed25519.PrivateKey
}

func newRelease(t *testing.T, tag, reports string) *release {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake binary is a shell script")
	}
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKIXPublicKey(pub)
	oldPub := releasePub
	releasePub = pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	t.Cleanup(func() { releasePub = oldPub })

	bin := []byte("#!/bin/sh\necho " + reports + "\n")
	h := sha256.Sum256(bin)
	sums := []byte(hex.EncodeToString(h[:]) + "  " + AssetName() + "\n" + strings.Repeat("0", 64) + "  dartcade-bridge_plan9_mips\n")
	r := &release{key: key, files: map[string][]byte{
		AssetName():  bin,
		"SHA256SUMS": sums,
	}}
	r.sign()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		name, ok := strings.CutPrefix(req.URL.Path, "/"+tag+"/")
		if b, found := r.files[name]; ok && found {
			w.Write(b)
			return
		}
		http.NotFound(w, req)
	}))
	t.Cleanup(srv.Close)
	oldBase := releaseBase
	releaseBase = srv.URL + "/"
	t.Cleanup(func() { releaseBase = oldBase })
	return r
}

func (r *release) sign() { r.files["SHA256SUMS.sig"] = ed25519.Sign(r.key, r.files["SHA256SUMS"]) }

func tag(s string) Tag {
	t, ok := ParseTag(s)
	if !ok {
		panic(s)
	}
	return t
}

func stage(t *testing.T, current, to string) (string, error) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "update")
	return dir, Stage(context.Background(), dir, tag(current), tag(to), func(Phase) {})
}

func TestStageAndApplyInstallTheRelease(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	var phases []Phase
	dir := filepath.Join(t.TempDir(), "update")
	if err := Stage(context.Background(), dir, tag("v0.9.0"), tag("v0.9.2"), func(p Phase) { phases = append(phases, p) }); err != nil {
		t.Fatal(err)
	}
	if got, ok := Staged(dir); !ok || got != tag("v0.9.2") {
		t.Fatalf("staged %v %v", got, ok)
	}
	if len(phases) != 2 || phases[0] != Downloading || phases[1] != Verifying {
		t.Fatalf("phases %v", phases)
	}

	target := filepath.Join(t.TempDir(), "dartcade-bridge")
	os.WriteFile(target, []byte("old"), 0o755)
	if err := Apply(dir, target, tag("v0.9.0")); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(target); !strings.Contains(string(b), "echo v0.9.2") {
		t.Fatalf("target is %q", b)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("Apply must consume the staged update")
	}
	// Nothing staged: every later stop leaves the binary alone
	if err := Apply(dir, target, tag("v0.9.0")); err != nil {
		t.Fatal(err)
	}
}

func TestStageRefusesWhatIsNotNewer(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	for _, current := range []string{"v0.9.2", "v0.10.0", "v1.0.0"} {
		if _, err := stage(t, current, "v0.9.2"); err == nil {
			t.Fatalf("staged v0.9.2 over %s", current)
		}
	}
}

func TestStageRejectsAForgedRelease(t *testing.T) {
	cases := map[string]func(r *release){
		"binary swapped": func(r *release) { r.files[AssetName()] = []byte("#!/bin/sh\necho v0.9.2 evil\n") },
		"sums edited, not re-signed": func(r *release) {
			r.files["SHA256SUMS"] = append(r.files["SHA256SUMS"], '\n')
		},
		"signed by another key": func(r *release) {
			_, other, _ := ed25519.GenerateKey(rand.Reader)
			r.files["SHA256SUMS.sig"] = ed25519.Sign(other, r.files["SHA256SUMS"])
		},
		"no signature":     func(r *release) { delete(r.files, "SHA256SUMS.sig") },
		"no binary for us": func(r *release) { delete(r.files, AssetName()) },
		"no checksum for us": func(r *release) {
			r.files["SHA256SUMS"] = []byte(strings.Repeat("0", 64) + "  dartcade-bridge_plan9_mips\n")
			r.sign()
		},
	}
	for name, forge := range cases {
		t.Run(name, func(t *testing.T) {
			r := newRelease(t, "v0.9.2", "v0.9.2")
			forge(r)
			dir, err := stage(t, "v0.9.0", "v0.9.2")
			if err == nil {
				t.Fatal("staged a forged release")
			}
			if _, ok := Staged(dir); ok {
				t.Fatal("a failed stage must not leave a ready update")
			}
		})
	}
}

func TestStageRejectsAnOlderReleaseUnderANewTag(t *testing.T) {
	// A correctly signed v0.9.1, served as v0.9.2
	newRelease(t, "v0.9.2", "v0.9.1")
	if _, err := stage(t, "v0.9.0", "v0.9.2"); err == nil || !strings.Contains(err.Error(), "reports") {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyReverifiesTheStagedBinary(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	dir, err := stage(t, "v0.9.0", "v0.9.2")
	if err != nil {
		t.Fatal(err)
	}
	// The unprivileged bridge (or whoever took it over) swaps the binary after staging
	os.WriteFile(filepath.Join(dir, binName), []byte("#!/bin/sh\necho v0.9.2\n# evil"), 0o755)
	target := filepath.Join(t.TempDir(), "dartcade-bridge")
	os.WriteFile(target, []byte("old"), 0o755)
	if err := Apply(dir, target, tag("v0.9.0")); err == nil {
		t.Fatal("applied a binary that doesn't match the signed checksum")
	}
	if b, _ := os.ReadFile(target); string(b) != "old" {
		t.Fatal("a failed apply must leave the old binary")
	}
	if _, err := os.Stat(target + ".new"); !os.IsNotExist(err) {
		t.Fatal("a failed apply must clean up its copy")
	}
}

func TestApplyRefusesASymlinkedStage(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	dir, err := stage(t, "v0.9.0", "v0.9.2")
	if err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(t.TempDir(), "secret")
	os.WriteFile(secret, []byte("root only"), 0o600)
	os.Remove(filepath.Join(dir, binName))
	os.Symlink(secret, filepath.Join(dir, binName))
	target := filepath.Join(t.TempDir(), "dartcade-bridge")
	os.WriteFile(target, []byte("old"), 0o755)
	if err := Apply(dir, target, tag("v0.9.0")); err == nil || !strings.Contains(err.Error(), "not a regular file") {
		t.Fatalf("err = %v", err)
	}
}

func TestParseTag(t *testing.T) {
	for _, s := range []string{"v0.9.2", "v10.0.123"} {
		if _, ok := ParseTag(s); !ok {
			t.Errorf("%s should parse", s)
		}
	}
	for _, s := range []string{"dev", "dev+b503493", "0.9.2", "v0.9", "v0.9.2-rc.1", "v0.9.2/../../x", " v0.9.2"} {
		if _, ok := ParseTag(s); ok {
			t.Errorf("%s should not parse", s)
		}
	}
	if !tag("v0.10.0").Newer(tag("v0.9.9")) || tag("v0.9.9").Newer(tag("v0.9.9")) || tag("v0.9.0").Newer(tag("v1.0.0")) {
		t.Error("Newer compares numerically, field by field")
	}
}

func TestBuiltInKeyParses(t *testing.T) {
	if err := checkSignature([]byte("x"), make([]byte, ed25519.SignatureSize)); err == nil || !strings.Contains(err.Error(), "not signed") {
		t.Fatalf("the embedded release.pub must be an ed25519 key: %v", err)
	}
}

// The staging dir belongs to the unprivileged bridge: root's Apply must not install an older
// release staged there, however well signed
func TestApplyRefusesAnOlderStagedRelease(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	dir, err := stage(t, "v0.9.0", "v0.9.2")
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "dartcade-bridge")
	os.WriteFile(target, []byte("v0.9.5"), 0o755)
	if err := Apply(dir, target, tag("v0.9.5")); err == nil || !strings.Contains(err.Error(), "not newer") {
		t.Fatalf("err = %v", err)
	}
	if b, _ := os.ReadFile(target); string(b) != "v0.9.5" {
		t.Fatal("a refused apply must leave the binary")
	}
}

func TestASecondReleaseKeyIsAccepted(t *testing.T) {
	r := newRelease(t, "v0.9.2", "v0.9.2")
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	der, _ := x509.MarshalPKIXPublicKey(other.Public())
	releasePub = append(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}), releasePub...)
	r.sign()
	if _, err := stage(t, "v0.9.0", "v0.9.2"); err != nil {
		t.Fatal(err)
	}
}
