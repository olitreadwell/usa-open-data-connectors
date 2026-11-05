# Python port fixtures

Each fixture is a symlink to the matching committed snapshot in
`packages/usa-sources/src/fixtures`. The two ports share one copy of every
snapshot. Dates in the filenames record the collection window. Tests read
these files offline and never fall back to the network.
