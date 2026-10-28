package main

// chownLike does nothing on Windows: the state dir's ACL (secureDir) covers the service account.
func chownLike(path, ref string) error { return nil }
