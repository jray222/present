import ipaddress
import socket
import logging
from urllib.parse import urlparse, urljoin
from typing import Tuple, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

# Maximum response sizes
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_PAGE_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_REDIRECTS = 5

class SSRFError(ValueError):
    """Raised when an SSRF violation or forbidden IP address is detected."""
    pass

class ResponseTooLargeError(ValueError):
    """Raised when the remote response exceeds maximum allowed size."""
    pass

def is_ip_allowed(ip_str: str) -> bool:
    """
    Check if an IP string is an allowed public Internet address.
    Rejects private, loopback, link-local, multicast, reserved, or unspecified IPs.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False

    # Explicitly block cloud metadata IPs
    if ip_str in ("169.254.169.254", "169.254.169.253"):
        return False

    return True

def validate_url_for_ssrf(url: str) -> Tuple[str, int]:
    """
    Validate that the URL has an allowed scheme (http/https) and does not resolve
    to internal, private, loopback, or link-local IP addresses.
    Returns (hostname, port).
    Raises SSRFError if invalid or disallowed.
    """
    if not url:
        raise SSRFError("URL cannot be empty")

    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise SSRFError(f"Disallowed URL scheme: '{scheme}'. Only http and https are permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("Invalid URL: missing hostname")

    lower_host = hostname.lower()
    if lower_host in ("localhost", "metadata.google.internal", "instance-data"):
        raise SSRFError(f"Access to host '{hostname}' is forbidden")

    port = parsed.port or (443 if scheme == "https" else 80)

    try:
        addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise SSRFError(f"DNS resolution failed for '{hostname}': {e}")

    if not addr_info:
        raise SSRFError(f"No IP addresses resolved for '{hostname}'")

    for item in addr_info:
        sockaddr = item[4]
        ip_str = sockaddr[0]
        if not is_ip_allowed(ip_str):
            raise SSRFError(f"Access to internal IP '{ip_str}' is forbidden")

    return hostname, port

import httpcore

class SafeNetworkBackend(httpcore.AnyIOBackend):
    """
    Network backend that prevents DNS rebinding attacks:
    1. Pre-resolves and validates host IPs before opening a socket.
    2. Directly connects to the verified IP so httpx cannot re-resolve to an internal address.
    3. Confirms the kernel-reported connected peer address before any data is sent.
    """

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: Optional[float] = None,
        local_address: Optional[str] = None,
        socket_options: Optional[Any] = None,
    ) -> httpcore.AsyncNetworkStream:
        try:
            addr_info = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise SSRFError(f"DNS resolution failed for '{host}': {e}")

        allowed_ips = []
        for item in addr_info:
            ip_str = item[4][0]
            if not is_ip_allowed(ip_str):
                raise SSRFError(f"Access to internal IP '{ip_str}' is forbidden")
            allowed_ips.append(ip_str)

        if not allowed_ips:
            raise SSRFError(f"No valid IP address found for host '{host}'")

        # Connect directly to the verified IP to eliminate DNS rebinding
        target_ip = allowed_ips[0]
        stream = await super().connect_tcp(
            target_ip,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

        # Check connected peer address from the OS socket
        server_addr = stream.get_extra_info("server_addr")
        if hasattr(server_addr, "__await__"):
            server_addr = await server_addr
        if server_addr:
            peer_ip = server_addr[0]
            if not is_ip_allowed(peer_ip):
                await stream.aclose()
                raise SSRFError(f"Access to internal IP '{peer_ip}' is forbidden")

        return stream


class SafeAsyncTransport(httpx.AsyncHTTPTransport):
    """Async HTTP transport configured with SafeNetworkBackend."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pool._network_backend = SafeNetworkBackend()


async def safe_fetch_url(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    max_bytes: int = MAX_PAGE_BYTES,
    timeout: float = 10.0,
    max_redirects: int = MAX_REDIRECTS,
) -> Tuple[int, bytes, Dict[str, str], str]:
    """
    Safely fetch a remote URL with:
    1. Pre-request SSRF validation on target host and resolved IP.
    2. Connection directly to verified IP and kernel peer address validation (closing DNS rebinding).
    3. Step-by-step redirect following with SSRF validation at every hop.
    4. Capped response size (streaming download aborts if max_bytes is exceeded).

    Returns (status_code, content_bytes, headers_dict, final_url).
    """
    current_url = url.strip()
    redirect_count = 0

    transport = SafeAsyncTransport()
    async with httpx.AsyncClient(transport=transport, timeout=timeout, follow_redirects=False) as client:
        while True:
            # Validate SSRF on current target
            validate_url_for_ssrf(current_url)

            req_headers = headers or {}
            response = await client.get(current_url, headers=req_headers)

            if response.is_redirect and "location" in response.headers:
                redirect_count += 1
                if redirect_count > max_redirects:
                    raise SSRFError("Too many redirects")
                next_url = urljoin(current_url, response.headers["location"])
                logger.debug("Following redirect from %s to %s", current_url, next_url)
                current_url = next_url
                continue

            content = bytearray()
            async for chunk in response.aiter_bytes():
                content.extend(chunk)
                if len(content) > max_bytes:
                    raise ResponseTooLargeError(
                        f"Response size exceeded limit of {max_bytes} bytes"
                    )

            resp_headers = dict(response.headers)
            return response.status_code, bytes(content), resp_headers, current_url
