package authn

import "net/url"

// Login option ids and labels. Config-free, non-secret — the SPA renders these
// and the user picks one.
const (
	optGitHubID    = "github"
	optGitHubLabel = "Log in with GitHub"
	optPasswordID  = "password"
	optPasswordLbl = "Username & password"

	// passwordStart is the native ROPC form's POST endpoint (Task 3). A password
	// *connector* instead redirects through /auth/login like GitHub.
	passwordStart = "/auth/password"
)

// OptionsConfig is the non-secret, flag-sourced description of which login
// methods to advertise. Empty connector/enable fields omit that option.
type OptionsConfig struct {
	GitHubConnector   string // --oidc-github-connector (Dex connector id); "" omits GitHub
	PasswordConnector string // --oidc-password-connector (redirect to IdP); "" + PasswordEnable=false omits password
	PasswordEnable    bool   // --oidc-password-enable (native ROPC form, no named connector)
}

// BuildOptions returns the advertised AuthOptions in a stable order (github
// first, then password), each with a non-secret Start URL. Order is
// deterministic so the SPA renders consistently. Returns nil when nothing is
// enabled (the SPA then shows "no login methods configured").
func BuildOptions(c OptionsConfig) []AuthOption {
	var opts []AuthOption
	if c.GitHubConnector != "" {
		opts = append(opts, AuthOption{
			ID:    optGitHubID,
			Label: optGitHubLabel,
			Start: "/auth/login?connector=" + url.QueryEscape(c.GitHubConnector),
		})
	}
	switch {
	case c.PasswordConnector != "":
		// Redirect through the broker's connector login page.
		opts = append(opts, AuthOption{
			ID:    optPasswordID,
			Label: optPasswordLbl,
			Start: "/auth/login?connector=" + url.QueryEscape(c.PasswordConnector),
		})
	case c.PasswordEnable:
		// Native username/password form, submitted to the ROPC relay endpoint.
		opts = append(opts, AuthOption{ID: optPasswordID, Label: optPasswordLbl, Start: passwordStart})
	}
	return opts
}
