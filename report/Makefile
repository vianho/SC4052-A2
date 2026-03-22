init:
	nix-shell -p typst --command "typst init @preview/clean-acmart:0.0.1" 
	cp -r clean-acmart/* ./
	rm -r clean-acmart
compile:
	nix-shell -p typst --command "typst compile main.typ report.pdf"

