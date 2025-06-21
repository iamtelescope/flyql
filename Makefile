all: test
test:
	cd python && make test
	cd javascript && make test
fmt:
	cd python && make fmt
	cd javascript && make fmt
