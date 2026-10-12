package main

import (
	"os"
	"testing"
)

func TestEnvBool(t *testing.T) {
	cases := []struct {
		v    string
		want bool
	}{
		{"", false},
		{"true", true},
		{"TRUE", true},
		{"1", true},
		{"yes", true},
		{"on", true},
		{" true ", true},
		{"0", false},
		{"false", false},
		{"nope", false},
	}
	for _, tc := range cases {
		t.Setenv("KESTREL_TEST_BOOL", tc.v)
		if got := envBool("KESTREL_TEST_BOOL"); got != tc.want {
			t.Errorf("envBool(%q) = %v, want %v", tc.v, got, tc.want)
		}
	}
}

func TestFlagOrEnv(t *testing.T) {
	t.Setenv("KESTREL_TEST_S", "fromenv")
	if got := flagOrEnv("fromflag", "KESTREL_TEST_S"); got != "fromflag" {
		t.Errorf("flag should win, got %q", got)
	}
	if got := flagOrEnv("", "KESTREL_TEST_S"); got != "fromenv" {
		t.Errorf("env fallback failed, got %q", got)
	}
	os.Unsetenv("KESTREL_TEST_S")
	if got := flagOrEnv("", "KESTREL_TEST_S"); got != "" {
		t.Errorf("want empty, got %q", got)
	}
}
