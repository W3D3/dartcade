package wled

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"syscall"
	"time"
)

type Info struct {
	Mac, Name, Version string
	Leds               int
}

// NewHTTPClient returns an http.Client limited to the local network. Its dialer inspects the
// resolved IP of every connection — not the hostname — so a .local name that resolves off the
// local network (or to loopback, unless allowLoopback is set) is refused at connect time, before
// any data is sent. It never follows redirects, so a device can't bounce a request elsewhere.
func NewHTTPClient() *http.Client {
	dialer := &net.Dialer{
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return fmt.Errorf("wled: refusing dial to %s: %w", address, err)
			}
			ip := net.ParseIP(host)
			if ip == nil {
				return fmt.Errorf("wled: refusing dial to non-IP %s", address)
			}
			if ip.IsLoopback() {
				if allowLoopback {
					return nil
				}
				return fmt.Errorf("wled: refusing dial to loopback %s", address)
			}
			if ip.IsPrivate() || ip.IsLinkLocalUnicast() {
				return nil
			}
			return fmt.Errorf("wled: refusing dial to non-local address %s", address)
		},
	}
	return &http.Client{
		Timeout:       time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		Transport:     &http.Transport{DialContext: dialer.DialContext},
	}
}

func get(ctx context.Context, hc *http.Client, host, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+host+path, nil)
	if err != nil {
		return nil, err
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %d", path, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, 1<<20))
}

// GetInfo reads /json/info; a host that doesn't answer with a MAC and version isn't WLED.
func GetInfo(ctx context.Context, hc *http.Client, host string) (Info, error) {
	b, err := get(ctx, hc, host, "/json/info")
	if err != nil {
		return Info{}, err
	}
	var raw struct {
		Ver, Name, Mac string
		Leds           struct{ Count int }
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return Info{}, err
	}
	if raw.Mac == "" || raw.Ver == "" {
		return Info{}, errors.New("not a WLED device")
	}
	return Info{Mac: raw.Mac, Name: raw.Name, Version: raw.Ver, Leds: raw.Leds.Count}, nil
}

// GetState reads /json/state and counts its segments.
func GetState(ctx context.Context, hc *http.Client, host string) (json.RawMessage, int, error) {
	b, err := get(ctx, hc, host, "/json/state")
	if err != nil {
		return nil, 0, err
	}
	var s struct{ Seg []json.RawMessage }
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, 0, err
	}
	return b, len(s.Seg), nil
}

// PostState sends state as the new /json/state.
func PostState(ctx context.Context, hc *http.Client, host string, state json.RawMessage) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+host+"/json/state", bytes.NewReader(state))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("/json/state answered %d", res.StatusCode)
	}
	return nil
}
