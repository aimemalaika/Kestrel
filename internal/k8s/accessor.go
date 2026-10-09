package k8s

import (
	"fmt"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
)

// ClusterAccessor yields the clients needed to talk to "the cluster". It hides
// how they are built so multiple clusters can be supported later.
type ClusterAccessor interface {
	Dynamic() dynamic.Interface
	Discovery() discovery.DiscoveryInterface
	Mapper() meta.RESTMapper
}

type restAccessor struct {
	dyn    dynamic.Interface
	disc   discovery.DiscoveryInterface
	mapper meta.RESTMapper
}

func (a *restAccessor) Dynamic() dynamic.Interface              { return a.dyn }
func (a *restAccessor) Discovery() discovery.DiscoveryInterface { return a.disc }
func (a *restAccessor) Mapper() meta.RESTMapper                 { return a.mapper }

// NewAccessor builds the single-cluster accessor from a rest.Config.
func NewAccessor(cfg *rest.Config) (ClusterAccessor, error) {
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("dynamic client: %w", err)
	}
	disc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("discovery client: %w", err)
	}
	return NewAccessorFrom(dyn, disc), nil
}

// NewAccessorFrom assembles an accessor from existing clients (used by tests
// with fakes). The mapper is a deferred, memory-cached discovery mapper.
func NewAccessorFrom(dyn dynamic.Interface, disc discovery.DiscoveryInterface) ClusterAccessor {
	return &restAccessor{
		dyn:    dyn,
		disc:   disc,
		mapper: restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(disc)),
	}
}
