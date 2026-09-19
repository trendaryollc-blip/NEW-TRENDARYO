/**
 * PROFILE PAGE INTEGRATION
 * Connects profile.html to backend API for user profile management
 */

class ProfileIntegration {
  constructor() {
    this.user = null;
  }

  async init() {
    await this.loadProfile();
    this.setupEventListeners();
  }

  async loadProfile() {
    try {
      const response = await API.getProfile();
      if (response.success) {
        this.user = response.data;
        this.populateForm();
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (!localUser.email) {
        window.location.href = 'login.html';
        return;
      }
      this.user = localUser;
      this.populateForm();
    }
  }

  populateForm() {
    if (!this.user) return;

    const fields = {
      firstName: this.user.firstName || this.user.name?.split(' ')[0] || '',
      lastName: this.user.lastName || this.user.name?.split(' ')[1] || '',
      email: this.user.email || '',
      phone: this.user.phone || ''
    };

    Object.keys(fields).forEach(key => {
      const field = document.getElementById(key);
      if (field) field.value = fields[key];
    });
  }

  setupEventListeners() {
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleProfileUpdate();
      });
    }

    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handlePasswordUpdate();
      });
    }
  }

  async handleProfileUpdate() {
    const profileData = {
      firstName: document.getElementById('firstName')?.value || '',
      lastName: document.getElementById('lastName')?.value || '',
      phone: document.getElementById('phone')?.value || ''
    };

    try {
      const response = await API.updateProfile(profileData);
      if (response.success) {
        this.user = { ...this.user, ...profileData };
        localStorage.setItem('user', JSON.stringify(this.user));
        this.showSuccess('profile-success', 'Profile updated successfully!');
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      this.showError('Failed to update profile. Please try again.');
    }
  }

  async handlePasswordUpdate() {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.showError('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      this.showError('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await API.updateProfile({ 
        currentPassword, 
        newPassword 
      });
      
      if (response.success) {
        this.showSuccess('password-success', 'Password updated successfully!');
        const passwordForm = document.getElementById('password-form');
        if (passwordForm) passwordForm.reset();
      }
    } catch (error) {
      console.error('Failed to update password:', error);
      this.showError('Failed to update password. Please check your current password.');
    }
  }

  showSuccess(elementId, message) {
    const successDiv = document.getElementById(elementId);
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.classList.add('show');
      setTimeout(() => successDiv.classList.remove('show'), 3000);
    } else {
      alert(message);
    }
  }

  showError(message) {
    alert(message);
  }
}

window.logout = function() {
  if (typeof API !== 'undefined') {
    API.logout();
  }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

let profileIntegration;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    profileIntegration = new ProfileIntegration();
    profileIntegration.init();
  });
} else {
  profileIntegration = new ProfileIntegration();
  profileIntegration.init();
}

window.profileIntegration = profileIntegration;
