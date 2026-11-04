/**
 * Renders a clean, high-resolution graphic card of the wishlist (or selected items)
 * using HTML5 Canvas and triggers a PNG download for family members.
 */
export async function exportListAsImage(wishlist, selectedItems = null) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const width = 800;
  const padding = 40;
  const itemHeight = 70;
  const headerHeight = 140;
  const rawItems = (selectedItems && selectedItems.length > 0) ? selectedItems : wishlist.items;
  const items = rawItems.slice(0, 10); // top 10 items for card
  const height = headerHeight + Math.max(1, items.length) * itemHeight + padding * 2;

  canvas.width = width;
  canvas.height = height;

  // 1. Warm Cream Background
  ctx.fillStyle = '#fff8ee';
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = '#ebd9c3';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // 2. Header
  ctx.fillStyle = '#d9432c'; // Tomato
  ctx.font = 'bold 36px Nunito, sans-serif';
  const owner = wishlist.managed_profile_name || wishlist.owner_name;
  const isSelectedSubset = selectedItems && selectedItems.length > 0 && selectedItems.length < wishlist.items.length;
  ctx.fillText(`🎁 ${owner}'s Wishlist`, padding, padding + 40);

  ctx.fillStyle = '#786353'; // Muted
  ctx.font = 'bold 20px Nunito Sans, sans-serif';
  const subtitle = isSelectedSubset ? `${wishlist.title} (${items.length} Selected Gifts)` : wishlist.title;
  ctx.fillText(subtitle, padding, padding + 75);

  ctx.strokeStyle = '#fa7b66';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding + 95);
  ctx.lineTo(width - padding, padding + 95);
  ctx.stroke();

  // 3. Items
  let y = headerHeight + padding;
  if (items.length === 0) {
    ctx.fillStyle = '#786353';
    ctx.font = 'italic 18px Nunito Sans, sans-serif';
    ctx.fillText('No items added to this wishlist yet!', padding, y + 20);
  } else {
    items.forEach((item, index) => {
      // Item pill background
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(padding, y, width - padding * 2, 56, 14);
      ctx.fill();
      ctx.strokeStyle = '#ebd9c3';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number & Title
      ctx.fillStyle = '#34241a'; // Ink
      ctx.font = 'bold 18px Nunito, sans-serif';
      const titleText = `${index + 1}. ${item.title}`;
      ctx.fillText(titleText.length > 45 ? titleText.slice(0, 42) + '...' : titleText, padding + 16, y + 34);

      // Price
      if (item.price) {
        ctx.fillStyle = '#15803d'; // Pine green
        ctx.font = 'bold 18px Nunito Sans, sans-serif';
        const priceText = `$${Number(item.price).toFixed(2)}`;
        const textWidth = ctx.measureText(priceText).width;
        ctx.fillText(priceText, width - padding - textWidth - 16, y + 34);
      }

      y += itemHeight;
    });
  }

  // 4. Download trigger
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.download = `${owner.toLowerCase().replace(/\s+/g, '-')}-wishlist.png`;
  a.href = dataUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
