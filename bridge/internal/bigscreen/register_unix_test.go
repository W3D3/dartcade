//go:build !windows

package bigscreen

import (
	"os"
	"os/user"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
)

func TestInvokingUserPicksSudoUser(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	t.Setenv("SUDO_USER", "root")
	u, err := InvokingUser()
	if err != nil || u.Username != "root" {
		t.Fatalf("got %v, %v", u, err)
	}
	t.Setenv("SUDO_USER", "")
	if _, err := InvokingUser(); err == nil {
		t.Fatal("root without SUDO_USER must error")
	}
}

func TestDropPrivilegesCmd(t *testing.T) {
	u := &user.User{Uid: "1234", Gid: "2345", Username: "alice", HomeDir: "/home/alice"}
	cmd, err := dropPrivilegesCmd("/usr/local/bin/dartcade-bridge", u, "write", "/x")
	if err != nil {
		t.Fatal(err)
	}
	cred := cmd.SysProcAttr.Credential
	if cred == nil || cred.Uid != 1234 || cred.Gid != 2345 {
		t.Fatalf("credential %+v", cred)
	}
	if !slices.Equal(cmd.Args, []string{"/usr/local/bin/dartcade-bridge", "register-helper-file", "write", "/x"}) {
		t.Errorf("args %v", cmd.Args)
	}
	if !slices.Contains(cmd.Env, "HOME=/home/alice") {
		t.Errorf("env %v", cmd.Env)
	}
	for _, e := range cmd.Env {
		if strings.HasPrefix(e, "SUDO_") {
			t.Errorf("env leaks %s", e)
		}
	}
	if _, err := dropPrivilegesCmd("x", &user.User{Uid: "abc", Gid: "1"}); err == nil {
		t.Error("bad uid accepted")
	}
}

func TestHelperFileWriteRemove(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := RunHelperFile([]string{"write", "/usr/local/bin/dartcade-bridge"}); err != nil {
		t.Fatal(err)
	}
	u := &user.User{HomeDir: home}
	b, err := os.ReadFile(registrationPath(u))
	if err != nil || !strings.Contains(string(b), "big-screen-helper") {
		t.Fatalf("not written: %v %s", err, b)
	}
	for range 2 { // idempotent
		if err := RunHelperFile([]string{"remove"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(registrationPath(u)); !os.IsNotExist(err) {
		t.Fatalf("still there: %v", err)
	}
	if err := RunHelperFile([]string{"bogus"}); err == nil {
		t.Error("unknown action accepted")
	}
}

func TestRegisterAsUserWritesOwnFile(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("as root Register re-runs the binary as the user")
	}
	home := t.TempDir()
	cur, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}
	u := &user.User{Uid: cur.Uid, Gid: cur.Gid, Username: cur.Username, HomeDir: home}
	if err := Register("/usr/local/bin/dartcade-bridge", u); err != nil {
		t.Fatal(err)
	}
	path := registrationPath(u)
	if !strings.HasPrefix(path, filepath.Clean(home)) {
		t.Fatalf("path %s outside home", path)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if uid := strconv.Itoa(int(fi.Sys().(*syscall.Stat_t).Uid)); uid != cur.Uid {
		t.Errorf("owner %s, want %s", uid, cur.Uid)
	}
	if err := Unregister(u); err != nil {
		t.Fatal(err)
	}
	if err := Unregister(u); err != nil {
		t.Fatalf("not idempotent: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("still there: %v", err)
	}
}
