/**
 * Community Photo & Image Management System
 * Allows in-browser photo upload, replacement, deletion, metadata editing,
 * persistent LocalStorage synchronization, and clean JSON export/import.
 */

export class PhotoManager {
  constructor(initialPhotos = [], onUpdateCallback = null) {
    this.storageKey = 'founders_community_photos_v1';
    this.onUpdateCallback = onUpdateCallback;
    this.photos = this.loadPhotos(initialPhotos);
    this.initModal();
  }

  loadPhotos(defaults) {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read photos from localStorage:', e);
    }
    return defaults;
  }

  savePhotos() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.photos));
    } catch (e) {
      console.warn('Could not save photos to localStorage:', e);
    }
    if (typeof this.onUpdateCallback === 'function') {
      this.onUpdateCallback(this.photos);
    }
  }

  getPhotos() {
    return this.photos;
  }

  addPhoto(photoData) {
    const newPhoto = {
      id: `photo-${Date.now()}`,
      title: photoData.title || 'Community Event',
      category: photoData.category || 'Community',
      location: photoData.location || 'Uzbekistan',
      date: photoData.date || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      image: photoData.image,
      caption: photoData.caption || ''
    };
    this.photos.unshift(newPhoto);
    this.savePhotos();
    this.renderManagerTable();
    return newPhoto;
  }

  updatePhoto(id, updatedFields) {
    const index = this.photos.findIndex(p => p.id === id);
    if (index !== -1) {
      this.photos[index] = { ...this.photos[index], ...updatedFields };
      this.savePhotos();
      this.renderManagerTable();
    }
  }

  deletePhoto(id) {
    this.photos = this.photos.filter(p => p.id !== id);
    this.savePhotos();
    this.renderManagerTable();
  }

  resetToDefaults(defaultPhotos) {
    this.photos = [...defaultPhotos];
    this.savePhotos();
    this.renderManagerTable();
  }

  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.photos, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "community-photos.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        this.photos = parsed;
        this.savePhotos();
        this.renderManagerTable();
        return true;
      }
    } catch (e) {
      alert('Invalid JSON file format.');
    }
    return false;
  }

  initModal() {
    let overlay = document.getElementById('photo-manager-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'photo-manager-modal';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-container wide">
          <div class="modal-header">
            <div>
              <h3>Community Photo Management System</h3>
              <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.2rem;">
                Upload real documentary photos, add captions, locations, and export data without code edits.
              </p>
            </div>
            <button class="modal-close-btn" id="pm-close-btn" aria-label="Close modal">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Add New Photo Form -->
            <div style="background: var(--bg-subtle); padding: 1.25rem; border-radius: 2px; border: 1px solid var(--border-subtle);">
              <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span class="mono-tag signal">NEW ENTRY</span> Upload Community Event Photo
              </h4>
              <form id="pm-add-form" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Event / Photograph Title *</label>
                    <input type="text" class="form-input" id="pm-input-title" placeholder="e.g. Pitch Day — Tashkent" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Category / Event Type *</label>
                    <select class="form-select" id="pm-input-category" required>
                      <option value="Pitch Events">Pitch Events</option>
                      <option value="Founder Talks">Founder Talks</option>
                      <option value="Regional Events">Regional Events</option>
                      <option value="Community">Community Meetup</option>
                      <option value="Startup Programs">Startup Programs</option>
                      <option value="Partnerships">Partnerships</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Location (City / Region) *</label>
                    <input type="text" class="form-input" id="pm-input-location" placeholder="e.g. Samarkand, Fergana, Tashkent" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Date *</label>
                    <input type="text" class="form-input" id="pm-input-date" placeholder="e.g. September 2026" required>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Photo Source * (Upload Local Image File or Paste URL)</label>
                  <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                    <input type="file" id="pm-file-input" accept="image/*" style="font-size: 0.8125rem;">
                    <span style="font-size: 0.8125rem; color: var(--text-muted);">or paste URL:</span>
                    <input type="url" class="form-input" id="pm-url-input" placeholder="https://..." style="flex: 1; min-width: 200px;">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Descriptive Caption *</label>
                  <textarea class="form-textarea" id="pm-input-caption" rows="2" placeholder="Documentary description of what happened at this meetup..." required></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
                  <button type="submit" class="btn btn-primary btn-sm">+ Add Photo to Live Gallery</button>
                </div>
              </form>
            </div>

            <!-- Existing Photos Table -->
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <h4 style="font-size: 1rem; font-weight: 700;">Live Community Photos (<span id="pm-count">0</span>)</h4>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="pm-export-btn" class="btn btn-secondary btn-sm">Export JSON</button>
                  <label class="btn btn-secondary btn-sm" style="margin:0; cursor:pointer;">
                    Import JSON
                    <input type="file" id="pm-import-input" accept=".json" style="display: none;">
                  </label>
                </div>
              </div>
              <div style="overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: 4px;">
                <table class="pm-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Title & Location</th>
                      <th>Date</th>
                      <th>Category</th>
                      <th style="text-align: right;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="pm-table-body">
                    <!-- Dynamic entries -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Setup Event Listeners
      document.getElementById('pm-close-btn').addEventListener('click', () => this.closeModal());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal();
      });

      document.getElementById('pm-add-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAddSubmit();
      });

      document.getElementById('pm-export-btn').addEventListener('click', () => {
        this.exportJSON();
      });

      document.getElementById('pm-import-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (this.importJSON(event.target.result)) {
              alert('Community photos imported successfully!');
            }
          };
          reader.readAsText(file);
        }
      });
    }
  }

  openModal() {
    const overlay = document.getElementById('photo-manager-modal');
    if (overlay) {
      this.renderManagerTable();
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal() {
    const overlay = document.getElementById('photo-manager-modal');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  handleAddSubmit() {
    const title = document.getElementById('pm-input-title').value;
    const category = document.getElementById('pm-input-category').value;
    const location = document.getElementById('pm-input-location').value;
    const date = document.getElementById('pm-input-date').value;
    const caption = document.getElementById('pm-input-caption').value;
    const urlInput = document.getElementById('pm-url-input').value;
    const fileInput = document.getElementById('pm-file-input');

    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.addPhoto({
          title, category, location, date, caption,
          image: e.target.result
        });
        document.getElementById('pm-add-form').reset();
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else if (urlInput.trim()) {
      this.addPhoto({
        title, category, location, date, caption,
        image: urlInput.trim()
      });
      document.getElementById('pm-add-form').reset();
    } else {
      alert('Please upload a file or specify an image URL.');
    }
  }

  renderManagerTable() {
    const tbody = document.getElementById('pm-table-body');
    const countEl = document.getElementById('pm-count');
    if (!tbody) return;

    countEl.textContent = this.photos.length;
    tbody.innerHTML = '';

    if (this.photos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No photos in system. Upload your first photo above.</td></tr>`;
      return;
    }

    this.photos.forEach(photo => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <img src="${photo.image}" alt="${photo.title}" class="pm-thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'60\\' height=\\'40\\' viewBox=\\'0 0 60 40\\'><rect fill=\\'%23eee\\' width=\\'60\\' height=\\'40\\'/><text fill=\\'%23999\\' x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'8\\'>Photo</text></svg>'">
        </td>
        <td>
          <div style="font-weight: 600;">${photo.title}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${photo.location}</div>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.75rem;">${photo.date}</td>
        <td>
          <span style="background: var(--bg-subtle); padding: 0.2rem 0.4rem; border-radius: 2px; font-size: 0.75rem; font-family: var(--font-mono);">
            ${photo.category}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm delete-btn" data-id="${photo.id}" style="color: #DC2626; border-color: #FECACA;">Delete</button>
        </td>
      `;

      tr.querySelector('.delete-btn').addEventListener('click', () => {
        if (confirm(`Remove "${photo.title}" from gallery?`)) {
          this.deletePhoto(photo.id);
        }
      });

      tbody.appendChild(tr);
    });
  }
}
