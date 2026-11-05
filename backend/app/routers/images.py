from fastapi import APIRouter, HTTPException, Query, Response
from app.services.safe_http import safe_fetch_url, SSRFError, ResponseTooLargeError, MAX_IMAGE_BYTES
import logging

logger = logging.getLogger(__name__)

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

    # Try https upgrade first
    target_url = clean_url
    if target_url.startswith("http://"):
        target_url = "https://" + target_url[7:]

    try:
        try:
            status_code, content, headers, _ = await safe_fetch_url(
                target_url,
                headers=IMAGE_HEADERS,
                max_bytes=MAX_IMAGE_BYTES,
                timeout=10.0,
            )
        except (SSRFError, ResponseTooLargeError):
            raise
        except Exception:
            # Fall back to original URL if https upgrade failed
            if target_url != clean_url:
                status_code, content, headers, _ = await safe_fetch_url(
                    clean_url,
                    headers=IMAGE_HEADERS,
                    max_bytes=MAX_IMAGE_BYTES,
                    timeout=10.0,
                )
            else:
                raise

        if status_code != 200:
            raise HTTPException(status_code=status_code, detail="Failed to fetch image.")

        content_type = headers.get("content-type", "image/jpeg")
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"

        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800, immutable",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except (SSRFError, ResponseTooLargeError) as e:
        logger.warning("Blocked unsafe image proxy request for '%s': %s", clean_url, e)
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Image proxy error for '%s': %s", clean_url, e)
        raise HTTPException(status_code=502, detail=f"Image proxy error: {str(e)}")
