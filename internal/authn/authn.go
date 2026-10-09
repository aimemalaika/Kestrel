// Package authn owns OIDC login, server-side sessions, and the authn/CSRF
// middleware that resolves the authenticated user and forwards their id_token.
//
// Model (literal OpenShift-console): the user is a REAL cluster identity. There
// is no ServiceAccount mapping, no TokenRequest minting, and no header
// impersonation. Kestrel runs the authorization-code flow against an OIDC
// issuer, verifies the id_token, and forwards it verbatim to the kube-apiserver
// on every downstream call. RBAC is enforced upstream.
//
// IMPORTANT (operator): the cluster's kube-apiserver OIDC configuration MUST
// trust the SAME issuer Kestrel logs users in against (--oidc-issuer), with a
// client/audience the apiserver accepts. Otherwise the forwarded id_tokens will
// not authenticate and every /api call will 401 at the apiserver.
package authn

import (
	"context"
	"fmt"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// DefaultScopes request an id_token (openid), display claims (profile, email),
// and a refresh_token (offline_access) for token refresh before expiry.
var DefaultScopes = []string{oidc.ScopeOpenID, "profile", "email", oidc.ScopeOfflineAccess}

// Config is the OIDC/oauth2 configuration resolved from flags.
type Config struct {
	Issuer        string
	ClientID      string
	ClientSecret  string
	RedirectURL   string
	GroupsClaim   string // default "groups"
	UsernameClaim string // default "email" (display only)
	Scopes        []string
}

// Claims is the verified subset of an id_token Kestrel relies on.
type Claims struct {
	Subject  string
	Username string
	Groups   []string
	Nonce    string
	Expiry   time.Time
}

// Verifier verifies a raw id_token and extracts claims. It is an interface so
// the callback/refresh paths can be tested with a fake (no live IdP).
type Verifier interface {
	Verify(ctx context.Context, rawIDToken string) (Claims, error)
}

// OAuth2 is the subset of *oauth2.Config the package uses. *oauth2.Config
// satisfies it; tests supply a fake exchanger/token-source.
type OAuth2 interface {
	AuthCodeURL(state string, opts ...oauth2.AuthCodeOption) string
	Exchange(ctx context.Context, code string, opts ...oauth2.AuthCodeOption) (*oauth2.Token, error)
	TokenSource(ctx context.Context, t *oauth2.Token) oauth2.TokenSource
}

// Authenticator owns the OIDC flow, the session store, and the middleware.
type Authenticator struct {
	oauth    OAuth2
	verifier Verifier
	store    *sessionStore
	key      []byte // HMAC key for signed cookies and state

	now func() time.Time // injectable clock for tests
}

// NewAuthenticator builds a production Authenticator: it discovers the issuer,
// constructs the oauth2 config and id_token verifier, and creates an empty
// session store. key signs session cookies and oauth state.
func NewAuthenticator(ctx context.Context, cfg Config, key []byte) (*Authenticator, error) {
	if cfg.GroupsClaim == "" {
		cfg.GroupsClaim = "groups"
	}
	if cfg.UsernameClaim == "" {
		cfg.UsernameClaim = "email"
	}
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = DefaultScopes
	}
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery for %q: %w", cfg.Issuer, err)
	}
	oauth := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  cfg.RedirectURL,
		Scopes:       cfg.Scopes,
	}
	verifier := &oidcVerifier{
		v:             provider.Verifier(&oidc.Config{ClientID: cfg.ClientID}),
		usernameClaim: cfg.UsernameClaim,
		groupsClaim:   cfg.GroupsClaim,
	}
	return &Authenticator{
		oauth:    oauth,
		verifier: verifier,
		store:    newSessionStore(),
		key:      key,
		now:      time.Now,
	}, nil
}

// Close stops background work (the session janitor). Safe to call once at
// shutdown; idempotent.
func (a *Authenticator) Close() error {
	a.store.stop()
	return nil
}

// oidcVerifier adapts a go-oidc verifier to the Verifier interface, mapping the
// configurable username/groups claims.
type oidcVerifier struct {
	v             *oidc.IDTokenVerifier
	usernameClaim string
	groupsClaim   string
}

func (o *oidcVerifier) Verify(ctx context.Context, raw string) (Claims, error) {
	idt, err := o.v.Verify(ctx, raw)
	if err != nil {
		return Claims{}, err
	}
	var all map[string]any
	if err := idt.Claims(&all); err != nil {
		return Claims{}, fmt.Errorf("decode id_token claims: %w", err)
	}
	c := Claims{Subject: idt.Subject, Nonce: idt.Nonce, Expiry: idt.Expiry}
	if u, ok := all[o.usernameClaim].(string); ok && u != "" {
		c.Username = u
	} else {
		c.Username = idt.Subject
	}
	c.Groups = stringSlice(all[o.groupsClaim])
	return c, nil
}

// stringSlice coerces a JSON claim (string, []string, or []any of strings) to a
// []string of group names.
func stringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	case []any:
		out := make([]string, 0, len(t))
		for _, e := range t {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
