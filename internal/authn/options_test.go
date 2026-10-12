package authn

import "testing"

func TestBuildOptions(t *testing.T) {
	cases := []struct {
		name    string
		cfg     OptionsConfig
		wantIDs []string
		starts  map[string]string
	}{
		{
			name:    "github only",
			cfg:     OptionsConfig{GitHubConnector: "gh"},
			wantIDs: []string{"github"},
			starts:  map[string]string{"github": "/auth/login?connector=gh"},
		},
		{
			name:    "password enabled only",
			cfg:     OptionsConfig{PasswordEnable: true},
			wantIDs: []string{"password"},
			starts:  map[string]string{"password": "/auth/password"},
		},
		{
			name:    "password connector only",
			cfg:     OptionsConfig{PasswordConnector: "ldap"},
			wantIDs: []string{"password"},
			starts:  map[string]string{"password": "/auth/login?connector=ldap"},
		},
		{
			name:    "both — github first, then password",
			cfg:     OptionsConfig{GitHubConnector: "gh", PasswordEnable: true},
			wantIDs: []string{"github", "password"},
		},
		{
			name:    "neither — nil",
			cfg:     OptionsConfig{},
			wantIDs: nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := BuildOptions(tc.cfg)
			if len(got) != len(tc.wantIDs) {
				t.Fatalf("len = %d want %d (%+v)", len(got), len(tc.wantIDs), got)
			}
			for i, id := range tc.wantIDs {
				if got[i].ID != id {
					t.Errorf("option[%d].ID = %q want %q", i, got[i].ID, id)
				}
				if got[i].Label == "" {
					t.Errorf("option[%d] (%s) has no label", i, id)
				}
				if want, ok := tc.starts[id]; ok && got[i].Start != want {
					t.Errorf("option %s Start = %q want %q", id, got[i].Start, want)
				}
			}
		})
	}
}
