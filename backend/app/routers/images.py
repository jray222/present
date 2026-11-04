from fastapi import APIRouter, HTTPException, Query, Response
import httpx
from urllib.parse import urlparse

router = APIRouter(prefix="/images", tags=["images"])

IMAGE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
}

@router.api_route("/proxy", methods=["GET", "HEAD"])
async def proxy_image(url: str = Query(..., description="External image URL to proxy")):
    clean_url = url.strip()
    if not clean_url or not clean_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid image URL.")

    # Always upgrade http to https where possible
    if clean_url.startswith("http://"):
        clean_url = "https://" + clean_url[7:]

    parsed = urlparse(clean_url)
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid host.")

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=IMAGE_HEADERS) as client:
            resp = await client.get(clean_url)
            if resp.status_code != 200:
                # If https failed and original was http, try original
                if clean_url != url:
                    resp = await client.get(url)

            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch image.")

            content_type = resp.headers.get("content-type", "image/jpeg")
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"

            return Response(
                content=resp.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=604800, immutable",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image proxy error: {str(e)}")
