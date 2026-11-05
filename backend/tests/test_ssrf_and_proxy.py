import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.safe_http import (
    is_ip_allowed,
    validate_url_for_ssrf,
    safe_fetch_url,
    SafeNetworkBackend,
    SSRFError,
)

def test_ip_filtering():
    # Disallowed IPs
    assert is_ip_allowed("127.0.0.1") is False
    assert is_ip_allowed("10.0.0.1") is False
    assert is_ip_allowed("192.168.1.1") is False
    assert is_ip_allowed("172.16.0.1") is False
    assert is_ip_allowed("169.254.169.254") is False
    assert is_ip_allowed("169.254.169.253") is False
    assert is_ip_allowed("0.0.0.0") is False
    assert is_ip_allowed("::1") is False
    assert is_ip_allowed("fe80::1") is False

    # Allowed public IPs
    assert is_ip_allowed("8.8.8.8") is True
    assert is_ip_allowed("1.1.1.1") is True
    assert is_ip_allowed("93.184.216.34") is True

def test_ssrf_url_validation():
    # Disallowed URLs
    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://127.0.0.1:5732")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://localhost:5732")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://169.254.169.254/latest/meta-data/")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://10.200.0.5/admin")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://metadata.google.internal/computeMetadata/v1/")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("http://instance-data/latest/meta-data/")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("file:///etc/passwd")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("ftp://example.com/file")

    with pytest.raises(SSRFError):
        validate_url_for_ssrf("gopher://127.0.0.1:25/")

def test_image_proxy_blocks_internal_hosts(client):
    # Proxying internal / loopback addresses must return 400 Bad Request
    internal_urls = [
        "http://127.0.0.1:5732/health",
        "http://localhost:5732/favicon.ico",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/private.png",
        "http://192.168.1.1/router.jpg",
        "http://172.16.0.5/secret.png",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://instance-data/meta",
        "ftp://example.com/pic.jpg",
        "file:///etc/passwd",
        "gopher://127.0.0.1:25/",
    ]

    for url in internal_urls:
        res = client.get(f"/api/images/proxy?url={url}")
        assert res.status_code == 400, f"Expected 400 for {url}, got {res.status_code}"

@pytest.mark.asyncio
async def test_dns_rebinding_protection():
    """Verify SafeNetworkBackend catches DNS rebinding when IP changes to internal at connect time."""
    backend = SafeNetworkBackend()

    # Case 1: connect_tcp resolves to private IP at connect time
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [
            (2, 1, 6, "", ("127.0.0.1", 80))
        ]
        with pytest.raises(SSRFError) as exc_info:
            await backend.connect_tcp("rebind.example.com", 80)
        assert "internal IP" in str(exc_info.value)

    # Case 2: connected socket peer reports private IP
    mock_stream = AsyncMock()
    mock_stream.get_extra_info = MagicMock(return_value=("10.0.0.1", 80))
    mock_stream.aclose = AsyncMock()

    with patch("socket.getaddrinfo") as mock_dns, \
         patch("httpcore.AnyIOBackend.connect_tcp", return_value=mock_stream):
        # Initial resolution claims public IP
        mock_dns.return_value = [
            (2, 1, 6, "", ("93.184.216.34", 80))
        ]
        with pytest.raises(SSRFError) as exc_info:
            await backend.connect_tcp("rebind.example.com", 80)
        assert "internal IP '10.0.0.1'" in str(exc_info.value)
        mock_stream.aclose.assert_awaited_once()
