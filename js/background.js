/* ============================================
   background.js - Background image management
   Uses Picsum for random beautiful images
   ============================================ */

const Background = {
  currentIndex: 0,
  fallbackGradients: [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #2d1b69 0%, #1b3a4b 50%, #1a5e3f 100%)',
    'linear-gradient(135deg, #3a1c71 0%, #4a2c6e 50%, #1e3c5c 100%)',
    'linear-gradient(135deg, #0c1b33 0%, #1a3a5c 50%, #2d5a3f 100%)',
    'linear-gradient(135deg, #1a1a3e 0%, #2d1b4e 50%, #3a2a5e 100%)',
  ],

  // Curated Unsplash photo IDs for study/cozy atmospheres
  photoIds: [
    'photo-1507003211169-0a1dd7228f2d',
    'photo-1499209974431-9dddcece7f88',
    'photo-1512820792206-6004efcf6e2b',
    'photo-1440778303588-435521a205bc',
    'photo-1518659522319-8fc7d1d5822d',
    'photo-1507525428034-b723cf961d3e',
    'photo-1506126613408-eca07ce68773',
    'photo-1470770841072-f978cf4d019e',
    'photo-1432821596592-2c1d78e7b7c2',
    'photo-1452421822248-d4c2b47f0c81',
    'photo-1518837695005-2083093ee35b',
    'photo-1505144808419-1957a94ca61e',
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
