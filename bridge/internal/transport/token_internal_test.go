package transport

import (
	"bytes"
	"context"
	"net"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/log"
)

func TestWithTokenEscapesAndKeepsTheQuery(t *testing.T) {
	got, err := withToken("wss://example.com/bridge?region=eu", "a b&c=d")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if q := u.Query(); q.Get("token") != "a b&c=d" || q.Get("region") != "eu" {
		t.Errorf("query %v, want the token and region", q)
	}
	if u.Host != "example.com" || u.Path != "/bridge" {
		t.Errorf("url %s lost its host or path", got)
	}
}

func TestWithTokenWithoutTokenKeepsTheURL(t *testing.T) {
	if got, _ := withToken("ws://h/bridge", ""); got != "ws://h/bridge" {
		t.Errorf("got %s", got)
	}
}

// A backend that can't be reached logs the dial error, which names the URL: the token
// must not be in it.
func TestDialErrorsDoNotLogTheToken(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close()

	const token = "s3cr3t/+tok en"
	cfgs := map[string]Config{
		"token set":          {BackendURL: "ws://" + addr + "/bridge", Token: token},
		"token in the url":   {BackendURL: "ws://" + addr + "/bridge?token=" + url.QueryEscape(token)},
		"url with own query": {BackendURL: "ws://" + addr + "/bridge?x=1", Token: token},
	}
	for name, cfg := range cfgs {
		t.Run(name, func(t *testing.T) {
			var buf bytes.Buffer
			log.SetOutput(&buf)
			defer log.SetOutput(os.Stderr)

			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			defer cancel()
			New(cfg, nil).Start(ctx) //nolint

			out := buf.String()
			if !strings.Contains(out, "backend connect failed") {
				t.Fatalf("no dial error logged: %q", out)
			}
			for _, s := range []string{token, url.QueryEscape(token), "s3cr3t"} {
				if strings.Contains(out, s) {
					t.Errorf("log contains the token (%q): %s", s, out)
				}
			}
		})
	}
}
