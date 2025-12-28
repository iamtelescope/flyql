all: test
test:
	cd python && make test
	cd javascript && make test
	cd golang && make test
fmt:
	cd python && make fmt
	cd javascript && make fmt
	cd golang && make fmt
lint:
	cd python && make lint
	cd golang && make lint
