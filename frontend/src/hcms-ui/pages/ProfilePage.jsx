import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword, getCurrentUser } from '../services/caseApi';

function ProfilePage() {
  const { user, setUser } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const result = await getCurrentUser();
      if (result.success) {
        setProfileData(result.user);
      }
    } catch (err) {
      console.error('[ProfilePage] Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
    setErrors({});
    setSuccessMessage('');
  };

  const validatePasswordForm = () => {
    const newErrors = {};

    if (!passwordData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!passwordData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (passwordData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }

    if (!passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSuccessMessage('');

    if (!validatePasswordForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      if (result.success) {
        setSuccessMessage('Password updated successfully.');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setErrors({ submit: result.message || 'Failed to update password' });
      }
    } catch (error) {
      setErrors({ submit: error.response?.data?.message || 'Failed to update password. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = 
    passwordData.currentPassword &&
    passwordData.newPassword &&
    passwordData.confirmPassword &&
    passwordData.newPassword === passwordData.confirmPassword;

  const displayUser = profileData || user;

  return (
    <div style={{
      width: '100%',
      padding: '24px 0',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    }}>
      {/* Main Profile Card */}
      <div style={{
        background: 'white',
        border: '1px solid #E2E8F0',
        borderRadius: 16,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 24
      }}>
        {/* Personal Information Section */}
        <div>
          <h2 style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#0F172A',
            margin: '0 0 18px 0'
          }}>
            Personal Information
          </h2>
          <div style={{
            borderBottom: '1px solid #E2E8F0',
            marginBottom: 18
          }} />

          <div style={{
            display: 'grid',
            gridTemplateColumns: '150px 1fr',
            gap: '16px'
          }}>
            <InfoRow label="Employee ID" value={displayUser?.employee_id || displayUser?.id || '-'} />
            <InfoRow label="Name" value={displayUser?.name || '-'} />
            <InfoRow label="Department" value={displayUser?.department || '-'} />
            <InfoRow label="Email" value={displayUser?.email || '-'} />
            <InfoRow label="Phone" value={displayUser?.phone || '-'} />
          </div>
        </div>

        {/* Password Section */}
        <div>
          <h2 style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#0F172A',
            margin: '0 0 18px 0'
          }}>
            Password
          </h2>
          <div style={{
            borderBottom: '1px solid #E2E8F0',
            marginBottom: 18
          }} />

          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PasswordField
                label="Current Password"
                name="currentPassword"
                value={passwordData.currentPassword}
                onChange={handlePasswordChange}
                error={errors.currentPassword}
                placeholder="Enter current password"
              />

              <PasswordField
                label="New Password"
                name="newPassword"
                value={passwordData.newPassword}
                onChange={handlePasswordChange}
                error={errors.newPassword}
                placeholder="Enter new password"
              />

              <PasswordField
                label="Confirm Password"
                name="confirmPassword"
                value={passwordData.confirmPassword}
                onChange={handlePasswordChange}
                error={errors.confirmPassword}
                placeholder="Confirm new password"
              />

              {successMessage && (
                <div style={{
                  color: '#16A34A',
                  fontSize: 12,
                  marginTop: 6
                }}>
                  {successMessage}
                </div>
              )}

              {errors.submit && (
                <div style={{
                  color: '#DC2626',
                  fontSize: 12,
                  marginTop: 6
                }}>
                  {errors.submit}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  style={{
                    height: 40,
                    padding: '0 18px',
                    background: isFormValid && !isSubmitting ? '#0F172A' : '#CBD5E1',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isFormValid && !isSubmitting ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (isFormValid && !isSubmitting) {
                      e.currentTarget.style.background = '#020617';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isFormValid && !isSubmitting) {
                      e.currentTarget.style.background = '#0F172A';
                    }
                  }}
                >
                  {isSubmitting ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: 'contents'
    }}>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#64748B',
        paddingTop: 6
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: '#0F172A',
        paddingTop: 6
      }}>
        {value}
      </div>
    </div>
  );
}

function PasswordField({ label, name, value, onChange, error, placeholder }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: '#64748B',
        marginBottom: 6
      }}>
        {label}
      </label>
      <input
        type="password"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: 44,
          background: 'white',
          border: error ? '1px solid #DC2626' : '1px solid #E2E8F0',
          borderRadius: 10,
          padding: '0 14px',
          fontSize: 14,
          color: '#0F172A',
          outline: 'none',
          transition: 'border-color 0.15s ease'
        }}
        onFocus={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = '#3B82F6';
          }
        }}
        onBlur={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = '#E2E8F0';
          }
        }}
      />
      {error && (
        <div style={{
          color: '#DC2626',
          fontSize: 11,
          marginTop: 4
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
