import React, { useState, useEffect, useCallback, useRef } from 'react';

function App() {
  // State
  const [serverStatus, setServerStatus] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [apiUsage, setApiUsage] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('scraper');
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [showUsagePanel, setShowUsagePanel] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [enrichingClinic, setEnrichingClinic] = useState(null);
  
  // Lead management state (persisted)
  const [leadStatuses, setLeadStatuses] = useState(() => {
    const saved = localStorage.getItem('leadStatuses');
    return saved ? JSON.parse(saved) : {};
  });
  const [leadNotes, setLeadNotes] = useState(() => {
    const saved = localStorage.getItem('leadNotes');
    return saved ? JSON.parse(saved) : {};
  });
  const [followUps, setFollowUps] = useState(() => {
    const saved = localStorage.getItem('followUps');
    return saved ? JSON.parse(saved) : {};
  });
  const [hiddenLeads, setHiddenLeads] = useState(() => {
    const saved = localStorage.getItem('hiddenLeads');
    return saved ? JSON.parse(saved) : {};
  });
  
  // Chat history management
  const [chatHistories, setChatHistories] = useState(() => {
    const saved = localStorage.getItem('chatHistories');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [showHiddenLeads, setShowHiddenLeads] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [formData, setFormData] = useState({
    source: 'gemini-maps',
    location: '',
    max: 50,
    enrich: false,
    webhookUrl: ''
  });

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Persist lead management data
  useEffect(() => {
    localStorage.setItem('leadStatuses', JSON.stringify(leadStatuses));
  }, [leadStatuses]);
  
  useEffect(() => {
    localStorage.setItem('leadNotes', JSON.stringify(leadNotes));
  }, [leadNotes]);
  
  useEffect(() => {
    localStorage.setItem('followUps', JSON.stringify(followUps));
  }, [followUps]);
  
  useEffect(() => {
    localStorage.setItem('hiddenLeads', JSON.stringify(hiddenLeads));
  }, [hiddenLeads]);

  // Save chat history to localStorage
  useEffect(() => {
    localStorage.setItem('chatHistories', JSON.stringify(chatHistories));
  }, [chatHistories]);

  // Lead management functions
  const updateLeadStatus = (clinicId, status) => {
    setLeadStatuses(prev => ({ ...prev, [clinicId]: status }));
  };

  const updateLeadNote = (clinicId, note) => {
    setLeadNotes(prev => ({ ...prev, [clinicId]: note }));
  };

  const setFollowUp = (clinicId, date) => {
    setFollowUps(prev => ({ ...prev, [clinicId]: date }));
  };

  const hideLeadFromList = (clinicId) => {
    setHiddenLeads(prev => ({ ...prev, [clinicId]: true }));
  };

  const unhideAllLeads = () => {
    setHiddenLeads({});
  };

  const deleteLeadPermanently = (clinicId) => {
    if (!currentJob) return;
    setCurrentJob(prev => ({
      ...prev,
      results: prev.results.filter(r => r.clinic_id !== clinicId),
      stats: {
        ...prev.stats,
        total: prev.stats.total - 1
      }
    }));
    // Clean up associated data
    const newStatuses = { ...leadStatuses };
    delete newStatuses[clinicId];
    setLeadStatuses(newStatuses);
  };

  // Enrich clinic data (find email, check for AI)
  const enrichClinicData = async (clinic) => {
    if (!clinic.website || clinic.website.includes('maps.google.com')) {
      alert('No website available to scrape for this clinic');
      return;
    }
    
    setEnrichingClinic(clinic.clinic_id);
    
    try {
      const res = await fetch('/api/ai/enrich-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();
      
      if (data.enrichedData) {
        // Update the clinic in currentJob with enriched data
        setCurrentJob(prev => ({
          ...prev,
          results: prev.results.map(c => 
            c.clinic_id === clinic.clinic_id 
              ? { ...c, ...data.enrichedData, enriched: true }
              : c
          )
        }));
      }
    } catch (err) {
      console.error('Failed to enrich clinic:', err);
    } finally {
      setEnrichingClinic(null);
    }
  };

  // Toggle row expansion
  const toggleRowExpand = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  // Start new chat
  const startNewChat = () => {
    if (chatMessages.length > 0) {
      // Save current chat
      const newHistory = {
        id: Date.now(),
        title: chatMessages[0]?.content?.substring(0, 40) + '...' || 'New Chat',
        messages: chatMessages,
        timestamp: new Date().toISOString(),
        clinic: selectedClinic?.clinic_name || null
      };
      setChatHistories(prev => [newHistory, ...prev].slice(0, 20)); // Keep last 20
    }
    setChatMessages([]);
    setCurrentChatId(null);
  };

  // Load chat from history
  const loadChat = (historyItem) => {
    setChatMessages(historyItem.messages);
    setCurrentChatId(historyItem.id);
    setShowChatSidebar(false);
  };

  // Delete chat from history
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChatHistories(prev => prev.filter(h => h.id !== id));
    if (currentChatId === id) {
      setChatMessages([]);
      setCurrentChatId(null);
    }
  };

  // Check server status and load usage
  const loadUsage = useCallback(() => {
    fetch('/api/ai/usage')
      .then(res => res.json())
      .then(setApiUsage)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(setServerStatus)
      .catch(() => setServerStatus({ status: 'error' }));

    fetch('/api/ai/status')
      .then(res => res.json())
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false }));

    loadUsage();
    
    // Refresh usage every 30 seconds
    const interval = setInterval(loadUsage, 30000);
    return () => clearInterval(interval);
  }, [loadUsage]);

  // Load jobs
  const loadJobs = useCallback(() => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(setJobs)
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Poll current job
  useEffect(() => {
    if (!currentJob || currentJob.status !== 'running') return;

    const interval = setInterval(() => {
      fetch(`/api/jobs/${currentJob.id}`)
        .then(res => res.json())
        .then(job => {
          setCurrentJob(job);
          if (job.status !== 'running') {
            loadJobs();
          }
        })
        .catch(console.error);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentJob, loadJobs]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Start scrape
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.location.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const { jobId } = await res.json();

      const jobRes = await fetch(`/api/jobs/${jobId}`);
      const job = await jobRes.json();
      setCurrentJob(job);
      loadJobs();
    } catch (err) {
      console.error('Failed to start scrape:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load a job
  const handleLoadJob = async (jobId) => {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    setCurrentJob(job);
  };

  // Download CSV
  const handleDownloadCSV = () => {
    if (!currentJob) return;
    window.open(`/api/jobs/${currentJob.id}/csv`, '_blank');
  };

  // Delete job
  const handleDeleteJob = async (jobId) => {
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    if (currentJob?.id === jobId) setCurrentJob(null);
    loadJobs();
  };

  // Send chat message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: {
            clinic: selectedClinic,
            allClinics: currentJob?.results || []
          }
        })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Generate email for clinic
  const handleGenerateEmail = async (clinic, type = 'introduction') => {
    setSelectedClinic(clinic);
    setActiveTab('ai');
    setChatMessages(prev => [...prev, { 
      role: 'user', 
      content: `Generate a ${type} email for ${clinic.clinic_name}` 
    }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic, emailType: type })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.email, isEmail: true }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: err.message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Generate call script
  const handleGenerateCallScript = async (clinic) => {
    setSelectedClinic(clinic);
    setActiveTab('ai');
    setChatMessages(prev => [...prev, { 
      role: 'user', 
      content: `Generate a call script for ${clinic.clinic_name}` 
    }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/generate-call-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.script, isScript: true }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: err.message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Score a single lead
  const handleScoreLead = async (clinic) => {
    setSelectedClinic(clinic);
    
    try {
      const res = await fetch('/api/ai/score-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();

      if (data.score) {
        // Update the clinic in currentJob with the score
        setCurrentJob(prev => ({
          ...prev,
          results: prev.results.map(c => 
            c.clinic_id === clinic.clinic_id 
              ? { ...c, leadScore: data.score }
              : c
          )
        }));
        loadUsage();
      }
    } catch (err) {
      console.error('Failed to score lead:', err);
    }
  };

  // Score all leads
  const handleScoreAllLeads = async () => {
    if (!currentJob?.results?.length) return;
    
    setIsScoring(true);
    
    try {
      const res = await fetch('/api/ai/score-all-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinics: currentJob.results.slice(0, 20) })
      });
      const data = await res.json();

      if (data.leads) {
        // Update currentJob with scored leads, sorted by score
        setCurrentJob(prev => ({
          ...prev,
          results: data.leads
        }));
        loadUsage();
      }
    } catch (err) {
      console.error('Failed to score leads:', err);
    } finally {
      setIsScoring(false);
    }
  };

  // Generate pitch for clinic
  const handleGeneratePitch = async (clinic, pitchType) => {
    setSelectedClinic(clinic);
    setActiveTab('ai');
    
    const pitchLabels = {
      'cold-call': '📞 Cold Call Script',
      'email': '📧 Email Pitch',
      'linkedin': '💼 LinkedIn Message',
      'follow-up': '✍️ Follow-up',
      'demo-offer': '🎯 Demo Offer'
    };
    
    setChatMessages(prev => [...prev, { 
      role: 'user', 
      content: `Generate ${pitchLabels[pitchType]} for ${clinic.clinic_name} (⭐${clinic.rating || 'N/A'}, ${clinic.reviewCount || 0} reviews)` 
    }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/generate-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic, pitchType })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.pitch, 
          isPitch: true,
          pitchType 
        }]);
      }
      loadUsage();
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: err.message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Analyze fit for clinic
  const handleAnalyzeFit = async (clinic) => {
    setSelectedClinic(clinic);
    setActiveTab('ai');
    setChatMessages(prev => [...prev, { 
      role: 'user', 
      content: `Analyze why ${clinic.clinic_name} would benefit from an AI voice agent (⭐${clinic.rating || 'N/A'}, ${clinic.reviewCount || 0} reviews)` 
    }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/analyze-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.analysis, isAnalysis: true }]);
      }
      loadUsage();
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: err.message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Quick actions
  const quickActions = [
    { label: '📧 Write intro email', action: () => setChatInput('Write an introduction email for the selected clinic') },
    { label: '📞 Create call script', action: () => setChatInput('Create a call script for the AI voice agent') },
    { label: '📊 Analyze my leads', action: () => setChatInput('Analyze the scraped clinics and tell me which ones to prioritize') },
    { label: '✍️ Follow-up email', action: () => setChatInput('Write a follow-up email for the selected clinic') },
  ];

  // Get usage bar color based on percentage
  const getUsageColor = (percent) => {
    if (percent >= 90) return '#ef4444';
    if (percent >= 75) return '#f97316';
    if (percent >= 50) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🦷</span>
            <span>DentalFinder</span>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-section">
            <h3>Main</h3>
            <div 
              className={`nav-item ${activeTab === 'scraper' ? 'active' : ''}`}
              onClick={() => setActiveTab('scraper')}
            >
              <span>🔍</span> Prospect Finder
            </div>
            <div 
              className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <span>🤖</span> AI Assistant
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Pipeline</h3>
            <div className="nav-item" style={{ cursor: 'default' }}>
              <span style={{ color: '#3b82f6' }}>●</span> New: {Object.values(leadStatuses).filter(s => s === 'new' || !s).length}
            </div>
            <div className="nav-item" style={{ cursor: 'default' }}>
              <span style={{ color: '#f59e0b' }}>●</span> Contacted: {Object.values(leadStatuses).filter(s => s === 'contacted').length}
            </div>
            <div className="nav-item" style={{ cursor: 'default' }}>
              <span style={{ color: '#10b981' }}>●</span> Interested: {Object.values(leadStatuses).filter(s => s === 'interested').length}
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Recent Jobs</h3>
            {jobs.slice(0, 5).map(job => (
              <div 
                key={job.id} 
                className={`nav-item ${currentJob?.id === job.id ? 'active' : ''}`}
                onClick={() => {
                  handleLoadJob(job.id);
                  setActiveTab('scraper');
                }}
                style={{ fontSize: '0.9rem' }}
              >
                <span style={{ opacity: 0.7 }}>📍</span> 
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {job.location}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          {apiUsage && (
            <div className="usage-mini">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                <span>Gemini Usage</span>
                <span>{apiUsage.geminiMaps.percentUsed}%</span>
              </div>
              <div className="usage-bar">
                <div 
                  className="usage-fill"
                  style={{ 
                    width: `${apiUsage.geminiMaps.percentUsed}%`,
                    backgroundColor: getUsageColor(apiUsage.geminiMaps.percentUsed)
                  }}
                />
              </div>
              <small style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {apiUsage.geminiMaps.remaining} requests left
              </small>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar">
          <div className="page-title">
            {activeTab === 'scraper' ? 'Prospect Finder' : 'AI Assistant'}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: serverStatus?.status === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }}></div>
              Server
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: aiStatus?.configured ? 'var(--success)' : 'var(--danger)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }}></div>
              AI
            </div>
          </div>
        </div>

        <div className="content-scroll-area">
          {activeTab === 'scraper' ? (
            <>
              {/* Search Section */}
              <div className="card">
                <form onSubmit={handleSubmit} className="search-container">
                  <div className="input-group">
                    <label>Location</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Miami, FL"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Source</label>
                    <select
                      className="form-control"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    >
                      <option value="gemini-maps">Gemini Maps (Best)</option>
                      <option value="googlemaps">Google Maps</option>
                      <option value="yelp">Yelp</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Count</label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      max="50"
                      value={formData.max}
                      onChange={(e) => setFormData({ ...formData, max: parseInt(e.target.value) || 50 })}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isLoading || !formData.location.trim()}
                    style={{ marginBottom: '1rem', height: '46px' }}
                  >
                    {isLoading ? 'Searching...' : '🚀 Find Clinics'}
                  </button>
                </form>
              </div>

              {/* Results Section */}
              {currentJob ? (
                <div className="results-section">
                  <div className="results-header">
                    <div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{currentJob.location}</h2>
                      <div className="results-count">
                        Found {currentJob.results.length} clinics • {currentJob.status}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={handleDownloadCSV}>
                        📥 Export CSV
                      </button>
                      {aiStatus?.configured && (
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={handleScoreAllLeads}
                          disabled={isScoring}
                        >
                          {isScoring ? '⏳ Scoring...' : '🎯 Score Leads'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Bar */}
                  <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {['all', 'new', 'contacted', 'interested', 'rejected'].map(filter => (
                      <button 
                        key={filter}
                        className={`btn btn-sm ${statusFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setStatusFilter(filter)}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  {/* Data Grid */}
                  <div className="data-grid">
                    {currentJob.results
                      .filter(row => statusFilter === 'all' || (leadStatuses[row.clinic_id] || 'new') === statusFilter)
                      .map((row) => (
                      <div key={row.clinic_id} className="data-card">
                        <div className="clinic-avatar">
                          {row.rating >= 4.5 ? '⭐' : '🦷'}
                        </div>
                        <div className="clinic-info">
                          <h4>{row.clinic_name}</h4>
                          <div className="clinic-meta">
                            <span>{row.rating || '-'} ★ ({row.reviewCount || 0})</span>
                            <span>•</span>
                            <span>{row.address}</span>
                          </div>
                        </div>
                        <div className="clinic-contact">
                          <div style={{ fontSize: '0.9rem' }}>{row.phone || 'No phone'}</div>
                          {row.website && (
                            <a href={row.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                              Visit Website
                            </a>
                          )}
                        </div>
                        <div className="clinic-status">
                          <select 
                            className="form-control" 
                            style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                            value={leadStatuses[row.clinic_id] || 'new'}
                            onChange={(e) => updateLeadStatus(row.clinic_id, e.target.value)}
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="interested">Interested</option>
                            <option value="rejected">Rejected</option>
                            <option value="won">Won</option>
                          </select>
                        </div>
                        <div className="clinic-score">
                          {row.leadScore ? (
                            <div className="status-badge status-qualified">
                              Score: {row.leadScore.score}
                            </div>
                          ) : (
                            <button 
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleScoreLead(row)}
                            >
                              Score
                            </button>
                          )}
                        </div>
                        <div className="clinic-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => handleGeneratePitch(row, 'cold-call')}>
                            📞 Script
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => handleGeneratePitch(row, 'email')}>
                            📧 Email
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🦷</div>
                  <h3>Ready to find dental clinics?</h3>
                  <p>Enter a location above to start prospecting.</p>
                </div>
              )}
            </>
          ) : (
            /* AI Chat Interface */
            <div className="chat-container" style={{ height: 'calc(100vh - 140px)' }}>
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    <h3>🤖 AI Assistant</h3>
                    <p>I can help you write emails, scripts, and analyze leads.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`message ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="message assistant">
                    <div className="spinner"></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-input-area" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatLoading}
                />
                <button type="submit" className="btn btn-primary" disabled={isChatLoading}>
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
