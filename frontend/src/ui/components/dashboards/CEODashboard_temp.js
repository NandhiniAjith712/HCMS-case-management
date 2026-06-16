          {activeTab === 'organizations' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>🏢 Organizations</h2>
                <p>Manage customer organizations and SPOC details</p>
                <button
                  type="button"
                  className="adr-btn adr-btn--primary"
                  onClick={() => {
                    setEditingOrg(null);
                    setShowAddOrg(true);
                  }}
                >
                  + Add Organization
                </button>
              </div>
              {showAddOrg && (
                <div className="ceo-modal-overlay" onClick={() => setShowAddOrg(false)}>
                  <div className="ceo-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="ceo-modal-header">
                      <h3>{editingOrg ? 'Edit Organization' : '+ Add New Organization'}</h3>
                      <button type="button" className="ceo-modal-close" onClick={() => setShowAddOrg(false)}>×</button>
                    </div>
                    <form onSubmit={editingOrg ? handleEditOrg : handleAddOrg}>
                    <div className="ceo-form-group">
                      <label>Organization Name</label>
                      <input
                        type="text"
                        value={editingOrg ? editingOrg.name : newOrg.name}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, name: e.target.value })
                          : setNewOrg({ ...newOrg, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>Description</label>
                      <textarea
                        value={editingOrg ? editingOrg.description : newOrg.description}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, description: e.target.value })
                          : setNewOrg({ ...newOrg, description: e.target.value })}
                        rows="3"
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>SPOC Name</label>
                      <input
                        type="text"
                        value={editingOrg ? editingOrg.spoc_name : newOrg.spoc_name}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, spoc_name: e.target.value })
                          : setNewOrg({ ...newOrg, spoc_name: e.target.value })}
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>SPOC Email</label>
                      <input
                        type="email"
                        value={editingOrg ? editingOrg.spoc_email : newOrg.spoc_email}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, spoc_email: e.target.value })
                          : setNewOrg({ ...newOrg, spoc_email: e.target.value })}
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>SPOC Phone</label>
                      <input
                        type="text"
                        value={editingOrg ? editingOrg.spoc_phone : newOrg.spoc_phone}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, spoc_phone: e.target.value })
                          : setNewOrg({ ...newOrg, spoc_phone: e.target.value })}
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>Domains</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(editingOrg ? editingOrg.domain : newOrg.domain).map((d, index) => (
                          <div key={index} style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={d.domain}
                              onChange={(e) => {
                                const domains = editingOrg ? editingOrg.domain : newOrg.domain;
                                const updatedDomains = [...domains];
                                updatedDomains[index] = { ...updatedDomains[index], domain: e.target.value };
                                if (editingOrg) {
                                  setEditingOrg({ ...editingOrg, domain: updatedDomains });
                                } else {
                                  setNewOrg({ ...newOrg, domain: updatedDomains });
                                }
                              }}
                              placeholder="e.g., example.com"
                              style={{ flex: 1 }}
                            />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9em' }}>
                              <input
                                type="checkbox"
                                checked={d.active}
                                onChange={(e) => {
                                  const domains = editingOrg ? editingOrg.domain : newOrg.domain;
                                  const updatedDomains = [...domains];
                                  updatedDomains[index] = { ...updatedDomains[index], active: e.target.checked };
                                  if (editingOrg) {
                                    setEditingOrg({ ...editingOrg, domain: updatedDomains });
                                  } else {
                                    setNewOrg({ ...newOrg, domain: updatedDomains });
                                  }
                                }}
                              />
                              Active
                            </label>
                            <button
                              type="button"
                              className="adr-btn adr-btn--ghost"
                              onClick={() => {
                                const domains = editingOrg ? editingOrg.domain : newOrg.domain;
                                const updatedDomains = domains.filter((_, i) => i !== index);
                                if (editingOrg) {
                                  setEditingOrg({ ...editingOrg, domain: updatedDomains });
                                } else {
                                  setNewOrg({ ...newOrg, domain: updatedDomains });
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="adr-btn adr-btn--ghost"
                          onClick={() => {
                            const domains = editingOrg ? editingOrg.domain : newOrg.domain;
                            const updatedDomains = [...domains, { domain: '', active: true }];
                            if (editingOrg) {
                              setEditingOrg({ ...editingOrg, domain: updatedDomains });
                            } else {
                              setNewOrg({ ...newOrg, domain: updatedDomains });
                            }
                          }}
                        >
                          + Add Domain
                        </button>
                      </div>
                    </div>
                    <div className="ceo-form-group">
                      <label>Status</label>
                      <select
                        value={editingOrg ? editingOrg.status : newOrg.status}
                        onChange={(e) => editingOrg 
                          ? setEditingOrg({ ...editingOrg, status: e.target.value })
                          : setNewOrg({ ...newOrg, status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="ceo-form-actions">
                      <button type="submit" className="adr-btn adr-btn--primary" disabled={isSavingOrg}>
                        {isSavingOrg ? 'Saving...' : (editingOrg ? 'Save Changes' : 'Save Organization')}
                      </button>
                      <button
                        type="button"
                        className="adr-btn adr-btn--ghost"
                        onClick={() => {
                          setShowAddOrg(false);
                          setEditingOrg(null);
                          setNewOrg({
                            name: '',
                            domain: [{ domain: '', active: true }],
                            description: '',
                            status: 'active',
                            spoc_name: '',
                            spoc_email: '',
                            spoc_phone: ''
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
                </div>
              )}
              <div className="ceo-data-table-wrap">
                <table className="ceo-data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>SPOC Details</th>
                      <th>Domains</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.map((org) => (
                      <tr key={org.id}>
                        <td style={{ fontWeight: 600 }}>{org.name}</td>
                        <td>{org.description || '—'}</td>
                        <td>
                          <div>
                            <div style={{ fontWeight: 500 }}>{org.spoc_name || '—'}</div>
                            <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{org.spoc_email || '—'}</div>
                            {org.spoc_phone && <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{org.spoc_phone}</div>}
                          </div>
                        </td>
                        <td>
                          {org.domain && org.domain.length > 0 ? (
                            <div style={{ fontSize: '0.85em' }}>
                              {org.domain.map((d, i) => (
                                <span key={i} style={{ display: 'inline-block', marginRight: '4px' }}>
                                  {d.domain} {d.active ? '✓' : '✗'}
                                </span>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          <span className={`ceo-status-pill ${org.status === 'active' ? 'ceo-status-pill--ok' : 'ceo-status-pill--inactive'}`}>
                            {org.status}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => {
                              setEditingOrg(org);
                              setShowAddOrg(true);
                            }}
                            style={{ marginRight: '8px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => handleDeleteOrg(org.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {organizations.length === 0 && (
                  <div className="ceo-empty">No organizations configured.</div>
                )}
              </div>
            </div>
          )}
