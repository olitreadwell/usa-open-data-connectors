"""Live smoke tests against the real APIs. Opt-in via RUN_SMOKE=1."""

import os

import pytest

from nzdata import create_stats_nz_client, probe_all_nz_data_sources

RUN_SMOKE = os.environ.get("RUN_SMOKE") == "1"

pytestmark = pytest.mark.skipif(not RUN_SMOKE, reason="set RUN_SMOKE=1 to run live smoke tests")

# The data.govt.nz catalogue blocks non-NZ IPs at the CDN (GitHub Actions
# runners get an HTML error page), so it is verified by the committed
# fixture instead of the live probe.
GEO_BLOCKED_SOURCE_IDS = {"data-govt-nz", "data-govt-datastore", "lawa"}

# NZOR's hosts (nzor.org.nz, data.nzor.org.nz) have failed the TLS handshake
# with "unexpected eof while reading" since 2026-09-21, from this machine and
# from Actions runners. The adapter stays for its committed fixture.
RETIRED_SOURCE_IDS = {"nzor"}


def test_probes_every_source_with_optional_keys():
    api_keys = {}
    if os.environ.get("LINZ_API_KEY"):
        api_keys["linz"] = os.environ["LINZ_API_KEY"]
    probes = probe_all_nz_data_sources(api_keys)
    assert len(probes) == 8
    for probe in probes:
        if probe.id in GEO_BLOCKED_SOURCE_IDS | RETIRED_SOURCE_IDS:
            continue
        assert probe.ok, f"{probe.id}: {probe.status}"


def test_stats_nz_catalogue_and_agriculture_data_keyless():
    client = create_stats_nz_client()
    dataflows = client.get_dataflow_catalogue()
    assert len(dataflows) > 0
    rows = client.get_data("AGR_AGR_003")
    assert len(rows) > 0
