package main

import "testing"

func TestBuildVersion(t *testing.T) {
	defer func(v, c string) { version, commit = v, c }(version, commit)

	cases := []struct{ version, commit, want string }{
		{"v0.4.2", "abc1234", "v0.4.2"},
		{"dev", "abc1234", "dev+abc1234"},
		{"dev", "abc1234-dirty", "dev+abc1234-dirty"},
	}
	for _, c := range cases {
		version, commit = c.version, c.commit
		if got := buildVersion(); got != c.want {
			t.Errorf("buildVersion(%q, %q) = %q, want %q", c.version, c.commit, got, c.want)
		}
	}
}
