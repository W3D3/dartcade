package wled

import "testing"

func TestLocalHost(t *testing.T) {
	saved := allowLoopback
	defer func() { allowLoopback = saved }()

	allowLoopback = false
	for host, want := range map[string]bool{
		"192.168.1.80": true, "10.0.0.5": true, "172.16.3.4": true, "169.254.1.1": true,
		"wled-7f3a2c.local": true, "127.0.0.1:8080": false, "[fe80::1]": true,
		"8.8.8.8": false, "example.com": false, "": false, "192.168.1.80/json": false,
		"http://192.168.1.80": false, "192.168.1.80@evil.com": false,
		"localhost": false, "172.32.0.1": false, "WLED.LOCAL": true,
	} {
		if got := LocalHost(host); got != want {
			t.Errorf("LocalHost(%q) = %v, want %v (allowLoopback=false)", host, got, want)
		}
	}

	allowLoopback = true
	if !LocalHost("127.0.0.1:8080") {
		t.Errorf(`LocalHost("127.0.0.1:8080") = false, want true (allowLoopback=true)`)
	}
}

// A segment's "bri" is opacity under the master, not another brightness to cap: WLED computes
// effective brightness as master bri * (segment bri / 255), so clamping both halves it twice
// (70% showed as ~49%). Only the top-level (master) "bri" is capped.
func TestClampBri(t *testing.T) {
	out, err := ClampBri([]byte(`{"on":true,"bri":255,"seg":[{"id":0,"bri":200},{"id":1,"bri":10},{"id":2,"stop":0}]}`), 178)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bri":178,"on":true,"seg":[{"bri":200,"id":0},{"bri":10,"id":1},{"id":2,"stop":0}]}`
	if string(out) != want {
		t.Errorf("got %s\nwant %s", out, want)
	}
}

func TestClampBriNoBriSetsMax(t *testing.T) {
	out, _ := ClampBri([]byte(`{"on":true}`), 100)
	if string(out) != `{"bri":100,"on":true}` {
		t.Errorf("got %s", out)
	}
}

func TestClampBriNonNumericBriClampedToMax(t *testing.T) {
	// WLED also accepts relative brightness strings ("~255" add, "~+50" relative) for the
	// top-level (master) "bri"; neither must bypass the clamp there.
	out, err := ClampBri([]byte(`{"bri":"~+50"}`), 150)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bri":150}`
	if string(out) != want {
		t.Errorf("got %s\nwant %s", out, want)
	}
}

// A segment's "bri" is uncappable opacity, not a brightness: a relative string there can't be
// resolved into an opacity value, so it's dropped rather than replaced with max (which would make
// it the brightest possible segment instead of leaving it to WLED's own default).
func TestClampBriNonNumericSegmentBriDropped(t *testing.T) {
	out, err := ClampBri([]byte(`{"seg":[{"id":0,"bri":"~255"}]}`), 150)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bri":150,"seg":[{"id":0}]}`
	if string(out) != want {
		t.Errorf("got %s\nwant %s", out, want)
	}
}
