package bm

import (
	"net"
	"net/url"
)

// Reachable is the Board Manager URL as other devices on the network can use it. A bridge next to
// its Board Manager is configured with localhost, which is useless as a link in the browser, so a
// loopback host becomes this machine's LAN address (the one its route to the backend leaves from).
// Anything else, or a failed lookup, comes back unchanged.
func Reachable(boardURL, backendURL string) string {
	u, err := url.Parse(boardURL)
	if err != nil || !isLoopback(u.Hostname()) {
		return boardURL
	}
	ip := outboundIP(backendURL)
	if ip == "" {
		return boardURL
	}
	if port := u.Port(); port != "" {
		u.Host = net.JoinHostPort(ip, port)
	} else {
		u.Host = ip
	}
	return u.String()
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// outboundIP is the local IPv4 address the backend is reached from. A UDP "connection" only picks
// the route, so nothing is sent.
func outboundIP(backendURL string) string {
	u, err := url.Parse(backendURL)
	if err != nil {
		return ""
	}
	port := u.Port()
	if port == "" {
		port = map[string]string{"ws": "80", "http": "80"}[u.Scheme]
		if port == "" {
			port = "443"
		}
	}
	conn, err := net.Dial("udp4", net.JoinHostPort(u.Hostname(), port))
	if err != nil {
		return ""
	}
	defer conn.Close()
	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok && !a.IP.IsLoopback() {
		return a.IP.String()
	}
	return ""
}
