import pytest
from app.services.scraper import clean_product_url, normalize_image_url, scrape_product_url

def test_clean_product_urls():
    # Amazon Desktop
    a1 = "https://www.amazon.com/Apple-AirPods-Charging-Latest-Model/dp/B07PXGQC1Q/ref=sr_1_1?crid=123"
    assert clean_product_url(a1) == "https://www.amazon.com/dp/B07PXGQC1Q"

    # Amazon Mobile
    a2 = "https://www.amazon.com/gp/aw/d/B07PXGQC1Q?ref=ppx_pop_mob_b_asin_title"
    assert clean_product_url(a2) == "https://www.amazon.com/dp/B07PXGQC1Q"

    # Target
    t1 = "https://www.target.com/p/apple-airpods-pro-2/-/A-86711674?preselect=86711674"
    assert clean_product_url(t1) == "https://www.target.com/p/-/A-86711674"

    # Walmart
    w1 = "https://www.walmart.com/ip/Apple-AirPods-with-Charging-Case-2nd-Generation/604342441?athbdg=L1102"
    assert clean_product_url(w1) == "https://www.walmart.com/ip/604342441"

    # Best Buy
    b1 = "https://www.bestbuy.com/site/apple-airpods-pro-2nd-generation-white/6543210.p?skuId=6543210"
    assert clean_product_url(b1) == "https://www.bestbuy.com/site/6543210.p"

def test_normalize_image_urls():
    assert normalize_image_url("//images.example.com/item.jpg") == "https://images.example.com/item.jpg"
    assert normalize_image_url("http://images.example.com/item.jpg") == "https://images.example.com/item.jpg"
    assert normalize_image_url("https://images.example.com/item.jpg") == "https://images.example.com/item.jpg"
    assert normalize_image_url("") == ""

@pytest.mark.asyncio
async def test_scraper_invalid_urls():
    res = await scrape_product_url("")
    assert res["title"] == ""
    assert res["clean_url"] == ""

    res_ftp = await scrape_product_url("ftp://example.com/product")
    assert res_ftp["title"] == ""
