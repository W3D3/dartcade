package transport

import (
	"bytes"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/log"
)

// The token goes in the Authorization header: a URL query lands in proxies' access logs.
func TestDialSendsTheTokenAsABearerHeader(t *testing.T) {
	const token = "s3cr3t/+tok en"
	got := make(chan *http.Request, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case got <- r:
		default:
		}
		http.Error(w, "no", http.StatusUnauthorized)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	// Wait for Start to return: it logs through the global logger, which the next test swaps out.
	defer func() { cancel(); <-stopped }()
	go func() {
		defer close(stopped)
		New(Config{BackendURL: "ws" + strings.TrimPrefix(srv.URL, "http") + "/bridge?x=1", Token: token}).Start(ctx) //nolint
	}()
	select {
	case r := <-got:
		if h := r.Header.Get("Authorization"); h != "Bearer "+token {
			t.Errorf("Authorization %q, want the bearer token", h)
		}
		if q := r.URL.RawQuery; q != "x=1" {
			t.Errorf("query %q, want only the configured one", q)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("bridge never dialled")
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
			New(cfg).Start(ctx) //nolint

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
