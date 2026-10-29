package bm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"dartcade/bridge/internal/schema"
)

// cameraTimeout bounds a live camera frame: the owner's preview polls it, so a hung camera
// fails fast instead of holding the request.
const cameraTimeout = 3 * time.Second

// maxRelayBody caps what one relayed call reads (a camera frame is well under it).
const maxRelayBody = 4 << 20

// relayClient never follows a redirect: the backend asked for this Board Manager, not another host.
var relayClient = &http.Client{
	Timeout:       httpTimeout,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// commands are the Board Manager calls behind each command op: method, path, and the path
// older Board Managers use when the first answers 404/405.
var commands = map[schema.BmRequestDataOp]struct{ method, path, fallback string }{
	schema.BmRequestDataOpStart:     {http.MethodPut, "/api/start", "/api/detection/start"},
	schema.BmRequestDataOpStop:      {http.MethodPut, "/api/stop", "/api/detection/stop"},
	schema.BmRequestDataOpReset:     {http.MethodPost, "/api/reset", ""},
	schema.BmRequestDataOpCalibrate: {http.MethodPost, "/api/config/calibration/auto?distortion=true", ""},
}

// Relay makes the Board Manager call a backend bm.request asks for and returns its bm.response.
func (c *Client) Relay(ctx context.Context, req schema.BmRequestData) schema.BmResponseData {
	res := schema.BmResponseData{Id: req.Id}
	fail := func(err error) schema.BmResponseData {
		res.Error = ptr(err.Error())
		return res
	}
	switch req.Op {
	case schema.BmRequestDataOpState:
		status, _, body, err := c.call(ctx, http.MethodGet, "/api/state")
		if err != nil {
			return fail(err)
		}
		res.Status = &status
		if status >= 200 && status < 300 {
			var state map[string]any
			if err := json.Unmarshal(body, &state); err != nil {
				return fail(fmt.Errorf("parse /api/state: %w", err))
			}
			// Board Manager 2 camelCases these; the status pill and the lights know the 1.x wording
			for _, k := range []string{"status", "event"} {
				if v, ok := state[k].(string); ok {
					state[k] = sentenceCase(v)
				}
			}
			res.State = state
		}
	case schema.BmRequestDataOpCamera:
		if req.Cam == nil {
			return fail(fmt.Errorf("camera op without cam"))
		}
		ctx, cancel := context.WithTimeout(ctx, cameraTimeout)
		defer cancel()
		status, ctype, body, err := c.call(ctx, http.MethodGet, fmt.Sprintf("/api/img/cams/%d", *req.Cam))
		if err != nil {
			return fail(err)
		}
		res.Status = &status
		if status >= 200 && status < 300 && strings.HasPrefix(ctype, "image/") {
			res.Image = ptr(base64.StdEncoding.EncodeToString(body))
		}
	default:
		cmd, ok := commands[req.Op]
		if !ok {
			return fail(fmt.Errorf("unknown op %q", req.Op))
		}
		status, _, _, err := c.call(ctx, cmd.method, cmd.path)
		if err == nil && (status == http.StatusNotFound || status == http.StatusMethodNotAllowed) && cmd.fallback != "" {
			status, _, _, err = c.call(ctx, cmd.method, cmd.fallback)
		}
		if err != nil {
			return fail(err)
		}
		res.Status = &status
	}
	return res
}

// call makes one request to the Board Manager: its status, content type and body.
func (c *Client) call(ctx context.Context, method, path string) (int, string, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.boardURL+path, nil)
	if err != nil {
		return 0, "", nil, err
	}
	resp, err := relayClient.Do(req)
	if err != nil {
		return 0, "", nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRelayBody))
	if err != nil {
		return 0, "", nil, fmt.Errorf("%s %s: %w", method, path, err)
	}
	return resp.StatusCode, resp.Header.Get("Content-Type"), body, nil
}

func ptr[T any](v T) *T { return &v }
