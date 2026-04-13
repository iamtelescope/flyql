.PHONY: all install fmt fmt-test test coverage

all: test
install:
	pnpm install
fmt:
	$(MAKE) -C packages/flyql fmt
	$(MAKE) -C packages/flyql-vue fmt
fmt-test:
	$(MAKE) -C packages/flyql fmt-test
	$(MAKE) -C packages/flyql-vue fmt-test
test:
	$(MAKE) -C packages/flyql test
	$(MAKE) -C packages/flyql-vue test
coverage:
	$(MAKE) -C packages/flyql coverage
	$(MAKE) -C packages/flyql-vue coverage
