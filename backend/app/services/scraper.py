import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs
from bs4 import BeautifulSoup
from app.services.safe_http import (
    safe_fetch_url,
    SSRFError,
    ResponseTooLargeError,
    MAX_PAGE_BYTES,
)

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

MOBILE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def clean_product_url(url: str) -> str:
    """Normalize and strip tracking query parameters (Amazon, Target, Walmart, Best Buy)."""
    if not url:
        return ""
    cleaned = url.strip()
    try:
        parsed = urlparse(cleaned)
        netloc = parsed.netloc.lower()

        # Amazon
        if "amazon." in netloc or netloc in ("a.co", "amzn.to"):
            asin_match = re.search(r'/(?:dp|gp/product|gp/aw/d|d|product)/([A-Z0-9]{10})', parsed.path)
            if asin_match:
                return f"https://www.amazon.com/dp/{asin_match.group(1)}"
            qs = parse_qs(parsed.query)
            for key in ("asin", "pd_rd_i"):
                if key in qs and qs[key]:
                    val = qs[key][0]
                    if re.match(r'^[A-Z0-9]{10}$', val):
                        return f"https://www.amazon.com/dp/{val}"

        # Target
        elif "target." in netloc:
            tcin_match = re.search(r'/A-([0-9]{8,10})', parsed.path)
            if tcin_match:
                return f"https://www.target.com/p/-/A-{tcin_match.group(1)}"

        # Walmart
        elif "walmart." in netloc:
            walmart_match = re.search(r'/ip/(?:[^/]+/)?([0-9]{7,12})', parsed.path)
            if walmart_match:
                return f"https://www.walmart.com/ip/{walmart_match.group(1)}"

        # Best Buy
        elif "bestbuy." in netloc:
            sku_match = re.search(r'/([0-9]{7,10})\.p', parsed.path)
            if sku_match:
                return f"https://www.bestbuy.com/site/{sku_match.group(1)}.p"
            qs = parse_qs(parsed.query)
            if "skuId" in qs and qs["skuId"]:
                sku = qs["skuId"][0]
                if re.match(r'^[0-9]{7,10}$', sku):
                    return f"https://www.bestbuy.com/site/{sku}.p"
    except Exception as e:
        logger.debug("Error normalizing product URL '%s': %s", url, e)

    return cleaned

def normalize_image_url(url: str) -> str:
    """Ensure image URLs use HTTPS and strip leading double-slashes or whitespace."""
    if not url:
        return ""
    clean = url.strip()
    if clean.startswith("//"):
        return f"https:{clean}"
    if clean.startswith("http://"):
        return f"https://{clean[7:]}"
    return clean

def extract_slug_title(url: str) -> Optional[str]:
    """Extract human-readable product title from URL slug as a resilient fallback."""
    try:
        parsed = urlparse(url)
        match = re.search(r'/([^/]+)/(?:dp|gp/product|product)/[A-Z0-9]{10}', parsed.path)
        if match:
            slug = match.group(1).replace("-", " ").strip()
            if len(slug) > 5 and not slug.lower().startswith("gp"):
                return slug
    except Exception:
        pass
    return None

async def scrape_product_url(url: str) -> dict:
    result = {
        "title": "",
        "description": "",
        "image_url": "",
        "price": None,
        "currency": "USD",
        "vendor": "",
        "clean_url": url.strip() if url else "",
    }
    if not url or not url.startswith(("http://", "https://")):
        return result

    raw_url = url.strip()
    cleaned_url = clean_product_url(raw_url)
    result["clean_url"] = cleaned_url

    parsed = urlparse(raw_url)
    domain = parsed.netloc.lower()

    if "amazon." in domain or domain in ("a.co", "amzn.to"):
        result["vendor"] = "Amazon"
    elif "target." in domain:
        result["vendor"] = "Target"
    elif "walmart." in domain:
        result["vendor"] = "Walmart"
    elif "etsy." in domain:
        result["vendor"] = "Etsy"
    elif "bestbuy." in domain:
        result["vendor"] = "Best Buy"

    slug_fallback_title = extract_slug_title(raw_url)

    # Quick Shopify / Indie Boutique .json check if URL has /products/
    if "/products/" in parsed.path:
        handle_match = re.search(r'/products/([^/?#]+)', parsed.path)
        if handle_match:
            handle = handle_match.group(1)
            scheme = parsed.scheme or "https"
            json_url = f"{scheme}://{parsed.netloc}/products/{handle}.json"
            try:
                status_code, content_bytes, _, _ = await safe_fetch_url(
                    json_url, headers=HEADERS, max_bytes=1024 * 1024, timeout=8.0
                )
                if status_code == 200:
                    prod = json.loads(content_bytes.decode("utf-8", errors="replace")).get("product", {})
                    if prod.get("title"):
                        result["title"] = prod["title"].strip()
                    if prod.get("vendor"):
                        result["vendor"] = prod["vendor"].strip()
                    if prod.get("images") and len(prod["images"]) > 0:
                        result["image_url"] = prod["images"][0].get("src", "")
                    if prod.get("variants") and len(prod["variants"]) > 0:
                        p = prod["variants"][0].get("price")
                        if p:
                            try:
                                result["price"] = float(str(p).replace("$", "").replace(",", "").strip())
                            except ValueError:
                                pass
                    if prod.get("body_html"):
                        clean_desc = re.sub(r'<[^>]+>', ' ', prod["body_html"])
                        result["description"] = re.sub(r'\s+', ' ', clean_desc).strip()[:300]
                    if result["title"]:
                        if result["image_url"]:
                            result["image_url"] = normalize_image_url(result["image_url"])
                        return result
            except (SSRFError, ResponseTooLargeError) as e:
                logger.warning("[scraper] SSRF / size block on Shopify check: %s", e)
                return result
            except Exception as e:
                logger.debug("[scraper] Shopify check error: %s", e)

    try:
        # Fetch page safely
        try:
            status_code, content_bytes, _, _ = await safe_fetch_url(
                cleaned_url, headers=HEADERS, max_bytes=MAX_PAGE_BYTES, timeout=12.0
            )
        except (SSRFError, ResponseTooLargeError) as e:
            logger.warning("[scraper] Blocked unsafe target '%s': %s", cleaned_url, e)
            return result
        except Exception:
            if cleaned_url != raw_url:
                try:
                    status_code, content_bytes, _, _ = await safe_fetch_url(
                        raw_url, headers=HEADERS, max_bytes=MAX_PAGE_BYTES, timeout=12.0
                    )
                except Exception as e:
                    logger.warning("[scraper] Fetch error for %s: %s", raw_url, e)
                    status_code = 500
                    content_bytes = b""
            else:
                status_code = 500
                content_bytes = b""

        html = content_bytes.decode("utf-8", errors="replace")

        # Fallback to mobile headers if bot-check triggered
        if status_code != 200 or "robot check" in html[:2000].lower():
            try:
                mob_status, mob_content, _, _ = await safe_fetch_url(
                    raw_url, headers=MOBILE_HEADERS, max_bytes=MAX_PAGE_BYTES, timeout=10.0
                )
                mob_html = mob_content.decode("utf-8", errors="replace")
                if mob_status == 200 and "robot check" not in mob_html[:2000].lower():
                    status_code = mob_status
                    html = mob_html
            except Exception:
                pass

        if status_code != 200:
            logger.info("[scraper] HTTP %s for %s", status_code, url)
            if slug_fallback_title:
                result["title"] = slug_fallback_title
            return result

        soup = BeautifulSoup(html, "html.parser")

        # 1. Amazon-Specific DOM Selectors
        if "amazon." in domain or domain in ("a.co", "amzn.to"):
            page_title = (soup.title.string or "").strip() if soup.title else ""
            is_bot_check = any(b in page_title.lower() for b in ["robot check", "captcha", "sorry! something went wrong", "automated access"])

            if not is_bot_check:
                title_elem = (
                    soup.find("span", {"id": "productTitle"})
                    or soup.find("h1", {"id": "title"})
                    or soup.find("span", {"id": "ebooksProductTitle"})
                )
                if title_elem:
                    result["title"] = title_elem.get_text(strip=True)

                img_elem = soup.find("img", {"id": "landingImage"}) or soup.find("img", {"id": "main-image"}) or soup.find("img", {"id": "imgBlkFront"})
                if img_elem:
                    dyn_img = img_elem.get("data-a-dynamic-image")
                    if dyn_img:
                        try:
                            dyn_data = json.loads(dyn_img)
                            if isinstance(dyn_data, dict) and dyn_data:
                                best_img = max(dyn_data.items(), key=lambda kv: kv[1][0] * kv[1][1] if isinstance(kv[1], (list, tuple)) and len(kv[1]) >= 2 else 0)[0]
                                result["image_url"] = best_img
                        except Exception:
                            pass
                    if not result["image_url"]:
                        result["image_url"] = img_elem.get("src") or img_elem.get("data-old-hires") or ""

                price_whole = soup.find("span", {"class": "a-price-whole"})
                if price_whole:
                    fraction = soup.find("span", {"class": "a-price-fraction"})
                    f_val = fraction.get_text(strip=True) if fraction else "00"
                    whole_clean = price_whole.get_text(strip=True).replace(".", "").replace(",", "")
                    try:
                        result["price"] = float(f"{whole_clean}.{f_val}")
                    except ValueError:
                        pass

                if result["price"] is None:
                    for offscreen in soup.find_all("span", {"class": "a-offscreen"}):
                        text = offscreen.get_text(strip=True)
                        match = re.search(r'\$([0-9]+(?:\.[0-9]{2})?)', text)
                        if match:
                            try:
                                result["price"] = float(match.group(1))
                                break
                            except ValueError:
                                pass

                if result["price"] is None:
                    input_price = soup.find("input", {"id": "attach-base-product-price"})
                    if input_price and input_price.get("value"):
                        try:
                            result["price"] = float(input_price["value"].strip())
                        except ValueError:
                            pass

        # 2. Target-Specific DOM Selectors
        elif "target." in domain:
            t_title = soup.find("h1", {"data-test": "product-title"}) or soup.find("h1", {"id": "pdp-product-title-id"})
            if t_title:
                result["title"] = t_title.get_text(strip=True)
            t_price = soup.find("span", {"data-test": "product-price"})
            if t_price:
                match = re.search(r'\$([0-9]+(?:\.[0-9]{2})?)', t_price.get_text())
                if match:
                    try:
                        result["price"] = float(match.group(1))
                    except ValueError:
                        pass
            t_img = soup.find("img", {"data-test": "product-image"})
            if t_img and t_img.get("src"):
                result["image_url"] = t_img["src"]

        # 3. Walmart-Specific DOM Selectors
        elif "walmart." in domain:
            w_title = soup.find("h1", {"id": "main-title"}) or soup.find("h1", {"itemprop": "name"})
            if w_title:
                result["title"] = w_title.get_text(strip=True)
            w_price = soup.find("span", {"itemprop": "price"}) or soup.find("span", {"data-testid": "price-line"})
            if w_price:
                match = re.search(r'\$([0-9]+(?:\.[0-9]{2})?)', w_price.get_text())
                if match:
                    try:
                        result["price"] = float(match.group(1))
                    except ValueError:
                        pass
            w_img = soup.find("img", {"data-testid": "hero-image"})
            if w_img and w_img.get("src"):
                result["image_url"] = w_img["src"]

        # 4. Best Buy-Specific DOM Selectors
        elif "bestbuy." in domain:
            bb_title = soup.find("div", {"class": "sku-title"}) or soup.find("h1", {"class": "heading-5"})
            if bb_title:
                result["title"] = bb_title.get_text(strip=True)
            bb_price = soup.find("div", {"class": "priceView-hero-price"})
            if bb_price:
                match = re.search(r'\$([0-9]+(?:\.[0-9]{2})?)', bb_price.get_text())
                if match:
                    try:
                        result["price"] = float(match.group(1))
                    except ValueError:
                        pass
            bb_img = soup.find("img", {"class": "primary-image"})
            if bb_img and bb_img.get("src"):
                result["image_url"] = bb_img["src"]

        # 5. OpenGraph Fallbacks
        if not result["title"]:
            og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
            if og_title and og_title.get("content"):
                clean = re.sub(r'^(?:Amazon\.com:\s*|Target:\s*|Walmart:\s*|Best Buy:\s*)', '', og_title["content"].strip())
                if not any(b in clean.lower() for b in ["robot check", "captcha", "sorry! something went wrong"]):
                    result["title"] = clean

        if not result["title"] and soup.title and soup.title.string:
            clean_title = re.sub(r'^(?:Amazon\.com:\s*|Target:\s*|Walmart:\s*|Best Buy:\s*)', '', soup.title.string.strip())
            if not any(b in clean_title.lower() for b in ["robot check", "captcha", "sorry! something went wrong"]):
                result["title"] = clean_title.strip()

        if not result["title"] and slug_fallback_title:
            result["title"] = slug_fallback_title

        if not result["image_url"]:
            og_image = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
            if og_image and og_image.get("content"):
                result["image_url"] = og_image["content"].strip()

        if not result["description"]:
            og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
            if og_desc and og_desc.get("content"):
                desc = og_desc["content"].strip()
                if not any(b in desc.lower() for b in ["robot check", "captcha"]):
                    result["description"] = desc

        if not result["vendor"]:
            og_site = soup.find("meta", property="og:site_name")
            if og_site and og_site.get("content"):
                result["vendor"] = og_site["content"].strip()

        # 6. JSON-LD Schema.org parsing
        if result["price"] is None or not result["image_url"]:
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "")
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        if item.get("@type") in ("Product", "Offer", "IndividualProduct"):
                            if not result["title"] and item.get("name"):
                                result["title"] = item["name"].strip()
                            offers = item.get("offers")
                            if isinstance(offers, list) and offers:
                                offers = offers[0]
                            if isinstance(offers, dict) and result["price"] is None:
                                p = offers.get("price") or offers.get("lowPrice")
                                if p:
                                    try:
                                        result["price"] = float(str(p).replace("$", "").replace(",", "").strip())
                                        result["currency"] = str(offers.get("priceCurrency", "USD")).upper()
                                    except ValueError:
                                        pass
                            if not result["image_url"] and item.get("image"):
                                img = item["image"]
                                result["image_url"] = img[0] if isinstance(img, list) else (img.get("url") if isinstance(img, dict) else str(img))
                except Exception:
                    continue

        # 7. OpenGraph and Meta Price tags
        if result["price"] is None:
            for meta_tag in ["og:price:amount", "product:price:amount", "price", "product:price"]:
                p_meta = soup.find("meta", property=meta_tag) or soup.find("meta", attrs={"name": meta_tag})
                if p_meta and p_meta.get("content"):
                    try:
                        result["price"] = float(p_meta["content"].replace("$", "").replace(",", "").strip())
                        break
                    except ValueError:
                        pass

        # 8. Fallback Regex Price Search
        if result["price"] is None:
            match = re.search(r'\$([0-9]{1,4}(?:\.[0-9]{2})?)', html[:40000])
            if match:
                try:
                    result["price"] = float(match.group(1))
                except ValueError:
                    pass

    except (SSRFError, ResponseTooLargeError) as e:
        logger.warning("[scraper] Blocked unsafe URL '%s': %s", url, e)
        if slug_fallback_title and not result["title"]:
            result["title"] = slug_fallback_title
    except Exception as e:
        logger.warning("[scraper] Error scraping %s: %s", url, e)
        if slug_fallback_title and not result["title"]:
            result["title"] = slug_fallback_title

    if result["image_url"]:
        result["image_url"] = normalize_image_url(result["image_url"])

    return result
