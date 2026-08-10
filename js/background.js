/* ============================================
   background.js - Background image management
   Curated scenic backgrounds with offline gradients
   ============================================ */

const Background = {
  currentIndex: 0,
  fallbackGradients: [
    'linear-gradient(135deg, #2d2d3f 0%, #3f3a52 50%, #5a4a3f 100%)',
    'linear-gradient(135deg, #403552 0%, #3f4a52 50%, #3f5248 100%)',
    'linear-gradient(135deg, #4a3f5c 0%, #564a5c 50%, #4a4a58 100%)',
    'linear-gradient(135deg, #2a3a4a 0%, #3a4a5a 50%, #3a4a3f 100%)',
    'linear-gradient(135deg, #3a3a50 0%, #453f56 50%, #50455c 100%)',
  ],

  // Curated Unsplash landscapes: mountains, forests, lakes, ocean and desert.
  photoIds: [
    'photo-1501785888041-af3ef285b470',
    'photo-1470770841072-f978cf4d019e',
    'photo-1464822759023-fed622ff2c3b',
    'photo-1441974231531-c6227db76b6e',
    'photo-1473448912268-2022ce9509d8',
    'photo-1507525428034-b723cf961d3e',
    'photo-1433086966358-54859d0ed716',
    'photo-1500534314209-a25ddb2bd429',
    'photo-1500530855697-b586d89ba3ee',
    'photo-1469474968028-56623f02e42e',
    'photo-1470252649378-9c29740c9fa8',
    'photo-1428908728789-d2de25dbd4e2',
  ],

  init() {
    this.el = document.getElementById('bg-image');
    this.loadRandomImage();
    document.getElementById('btn-refresh-bg').addEventListener('click', () => this.loadRandomImage());
  },

  getImageUrl() {
    // Use a random photo from our curated list via Unsplash
    const id = this.photoIds[Math.floor(Math.random() * this.photoIds.length)];
    return `https://images.unsplash.com/${id}?w=1920&h=1080&fit=crop&auto=format`;
  },

  loadRandomImage() {
    const url = this.getImageUrl();
    const img = new Image();
    img.onload = () => {
      this.el.style.backgroundImage = `url(${url})`;
    };
    img.onerror = () => {
      // Fallback to gradient
      const grad = this.fallbackGradients[this.currentIndex % this.fallbackGradients.length];
      this.currentIndex++;
      this.el.style.backgroundImage = grad;
    };
    img.src = url;
  },
};
