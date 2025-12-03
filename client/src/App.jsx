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
    <div className="app">
      {/* API Usage Panel (Top Right) */}
      <div className="usage-button-container">
        <button 
          className={`usage-toggle-btn ${apiUsage?.alerts?.length > 0 ? 'has-alerts' : ''}`}
          onClick={() => setShowUsagePanel(!showUsagePanel)}
          title="API Usage"
        >
          📊 {apiUsage?.geminiMaps?.used || 0}/{apiUsage?.geminiMaps?.limit || 500}
          {apiUsage?.alerts?.length > 0 && <span className="alert-dot">!</span>}
        </button>
        
        {showUsagePanel && apiUsage && (
          <div className="usage-panel">
            <div className="usage-panel-header">
              <h3>🔑 API Usage</h3>
              <span className="reset-timer">Resets in: {apiUsage.resetIn}</span>
            </div>
            
            {/* Alerts */}
            {apiUsage.alerts?.map((alert, i) => (
              <div key={i} className={`usage-alert ${alert.type}`}>
                {alert.message}
              </div>
            ))}
            
            {/* Gemini Maps Usage */}
            <div className="usage-section">
              <div className="usage-label">
                <span>🗺️ Gemini Maps</span>
                <span>{apiUsage.geminiMaps.used} / {apiUsage.geminiMaps.limit}</span>
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
              <small>{apiUsage.geminiMaps.remaining} requests remaining</small>
            </div>
            
            {/* Gemini AI Usage */}
            <div className="usage-section">
              <div className="usage-label">
                <span>🤖 Gemini AI</span>
                <span>{apiUsage.gemini.used} / {apiUsage.gemini.limit}</span>
              </div>
              <div className="usage-bar">
                <div 
                  className="usage-fill"
                  style={{ 
                    width: `${apiUsage.gemini.percentUsed}%`,
                    backgroundColor: getUsageColor(apiUsage.gemini.percentUsed)
                  }}
                />
              </div>
              <small>{apiUsage.gemini.remaining} requests remaining</small>
              <small style={{ display: 'block', marginTop: '4px' }}>
                Rate: {apiUsage.gemini.requestsThisMinute}/{apiUsage.gemini.requestsPerMinuteLimit} per minute
              </small>
            </div>
            
            {/* Errors */}
            {(apiUsage.gemini.errors > 0 || apiUsage.geminiMaps.errors > 0) && (
              <div className="usage-section errors">
                <small>⚠️ Errors today: {apiUsage.gemini.errors + apiUsage.geminiMaps.errors}</small>
              </div>
            )}
            
            <div className="usage-footer">
              <small>💡 Tip: Use another API key when limits are reached</small>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="header">
        <h1>🦷 Dental Clinic Prospect Finder</h1>
        <p>Find dental clinics for your AI voice agent campaigns</p>
        
        {/* Tabs */}
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            🔍 Scraper
          </button>
          <button 
            className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            🤖 AI Assistant
            {!aiStatus?.configured && <span className="badge">Setup</span>}
          </button>
        </div>
      </header>

      <main className="main">
        {/* Sidebar */}
        <div className="sidebar">
          {activeTab === 'scraper' ? (
            <>
              {/* Search Form */}
              <div className="card">
                <div className="card-header">🔍 New Search</div>
                <div className="card-body">
                  <div className="alert alert-success">
                    <span>✅</span>
                    <div>
                      <strong>Powered by Gemini AI</strong>
                      <br />
                      <small>500 free searches/day with Google Maps data!</small>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label>Data Source</label>
                      <select
                        value={formData.source}
                        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      >
                        <option value="gemini-maps">⭐ Gemini Maps (Recommended)</option>
                        <option value="googlemaps">🆓 Google Maps Scraper</option>
                        <option value="yelp">🆓 Yelp</option>
                        <option value="yellowpages">🆓 YellowPages</option>
                        <option value="places">Google Places API (Paid)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Location *</label>
                      <input
                        type="text"
                        placeholder="Austin, TX"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Max Results</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={formData.max}
                        onChange={(e) => setFormData({ ...formData, max: parseInt(e.target.value) || 50 })}
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary btn-block"
                      disabled={isLoading || !formData.location.trim()}
                    >
                      {isLoading ? 'Starting...' : '🚀 Start Scraping'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Past Jobs */}
              <div className="card">
                <div className="card-header">
                  📋 Recent Jobs
                  {jobs.length > 0 && (
                    <button 
                      className="btn btn-sm btn-outline" 
                      style={{ marginLeft: 'auto', fontSize: '0.7rem' }}
                      onClick={() => {
                        if (confirm('Delete all jobs?')) {
                          jobs.forEach(j => handleDeleteJob(j.id));
                        }
                      }}
                    >
                      🗑️ Clear All
                    </button>
                  )}
                </div>
                <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto', overflowX: 'hidden' }}>
                  {jobs.length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No jobs yet.</p>
                  ) : (
                    <div className="jobs-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {jobs.slice(0, 10).map(job => (
                        <div 
                          key={job.id} 
                          className={`job-item ${currentJob?.id === job.id ? 'active' : ''}`}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            padding: '0.5rem 0.75rem',
                            background: currentJob?.id === job.id ? '#eff6ff' : 'var(--gray-50)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: currentJob?.id === job.id ? '1px solid var(--primary)' : '1px solid transparent'
                          }}
                        >
                          <div 
                            className="job-info" 
                            onClick={() => handleLoadJob(job.id)}
                            style={{ flex: 1 }}
                          >
                            <div className="job-location" style={{ fontWeight: 500 }}>{job.location}</div>
                            <div className="job-meta" style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>
                              {job.source} • {job.resultCount} results
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`status-badge ${job.status}`} style={{ fontSize: '0.65rem' }}>{job.status}</span>
                            <button 
                              className="btn-icon-sm"
                              onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                              title="Delete job"
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                opacity: 0.5, 
                                fontSize: '0.8rem',
                                padding: '2px'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sales Pipeline Summary */}
              {Object.keys(leadStatuses).length > 0 && (
                <div className="card">
                  <div className="card-header">📊 My Pipeline</div>
                  <div className="card-body" style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8rem' }}>
                      <div style={{ padding: '0.5rem', background: '#e0e7ff', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3730a3' }}>
                          {Object.values(leadStatuses).filter(s => s === 'new' || !s).length}
                        </div>
                        <div style={{ color: '#3730a3', fontSize: '0.7rem' }}>New</div>
                      </div>
                      <div style={{ padding: '0.5rem', background: '#fef3c7', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#92400e' }}>
                          {Object.values(leadStatuses).filter(s => s === 'contacted').length}
                        </div>
                        <div style={{ color: '#92400e', fontSize: '0.7rem' }}>Contacted</div>
                      </div>
                      <div style={{ padding: '0.5rem', background: '#dcfce7', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#166534' }}>
                          {Object.values(leadStatuses).filter(s => s === 'interested').length}
                        </div>
                        <div style={{ color: '#166534', fontSize: '0.7rem' }}>Interested</div>
                      </div>
                      <div style={{ padding: '0.5rem', background: '#d1fae5', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#065f46' }}>
                          {Object.values(leadStatuses).filter(s => s === 'won').length}
                        </div>
                        <div style={{ color: '#065f46', fontSize: '0.7rem' }}>Won 🎉</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#fee2e2', borderRadius: '6px', textAlign: 'center', fontSize: '0.75rem' }}>
                      <span style={{ color: '#991b1b' }}>
                        {Object.values(leadStatuses).filter(s => s === 'rejected').length} rejected
                      </span>
                      {Object.values(leadStatuses).filter(s => s === 'rejected').length > 0 && (
                        <button 
                          className="btn btn-xs btn-outline"
                          style={{ marginLeft: '0.5rem' }}
                          onClick={() => {
                            if (confirm('Clear all rejected leads from tracking?')) {
                              const newStatuses = { ...leadStatuses };
                              Object.keys(newStatuses).forEach(k => {
                                if (newStatuses[k] === 'rejected') delete newStatuses[k];
                              });
                              setLeadStatuses(newStatuses);
                              localStorage.setItem('leadStatuses', JSON.stringify(newStatuses));
                            }
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* AI Setup */}
              {!aiStatus?.configured && (
                <div className="card">
                  <div className="card-header">⚙️ Setup AI</div>
                  <div className="card-body">
                    <div className="alert alert-warning">
                      <span>🔑</span>
                      <div>
                        <strong>Free Gemini API Key</strong>
                        <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
                          <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get API Key</a></li>
                          <li>Add to .env:<br/><code>GEMINI_API_KEY=xxx</code></li>
                          <li>Restart server</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="card">
                <div className="card-header">⚡ Quick Actions</div>
                <div className="card-body">
                  <div className="quick-actions">
                    {quickActions.map((action, i) => (
                      <button 
                        key={i} 
                        className="btn btn-outline btn-sm btn-block"
                        onClick={action.action}
                        disabled={!aiStatus?.configured}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Selected Clinic */}
              {selectedClinic && (
                <div className="card">
                  <div className="card-header">🏥 Selected</div>
                  <div className="card-body">
                    <strong>{selectedClinic.clinic_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {selectedClinic.city}, {selectedClinic.state}
                    </div>
                    <button 
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => setSelectedClinic(null)}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Main Content */}
        <div className="results-panel">
          {activeTab === 'scraper' ? (
            currentJob ? (
              <div className="card">
                <div className="card-header">
                  <div className="results-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span>📊 {currentJob.location}</span>
                      <span className={`status-badge ${currentJob.status}`}>{currentJob.status}</span>
                    </div>
                    <div className="results-actions">
                      {currentJob.results.length > 0 && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={handleDownloadCSV}>
                            📥 CSV
                          </button>
                          {aiStatus?.configured && (
                            <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('ai')}>
                              🤖 AI
                            </button>
                          )}
                        </>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => handleDeleteJob(currentJob.id)}>
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  {/* Stats */}
                  <div className="stats-grid">
                    <div className="stat-card primary">
                      <div className="value">{currentJob.stats.total}</div>
                      <div className="label">Total</div>
                    </div>
                    <div className="stat-card success">
                      <div className="value">{currentJob.stats.validPhones}</div>
                      <div className="label">Valid Phones</div>
                    </div>
                    <div className="stat-card warning">
                      <div className="value">{currentJob.stats.invalidPhones}</div>
                      <div className="label">Invalid</div>
                    </div>
                    <div className="stat-card">
                      <div className="value">{currentJob.stats.withEmail}</div>
                      <div className="label">Emails</div>
                    </div>
                  </div>

                  {currentJob.status === 'running' && (
                    <div className="progress-bar">
                      <div className="fill" style={{ width: `${(currentJob.results.length / formData.max) * 100}%` }}></div>
                    </div>
                  )}

                  {currentJob.error && (
                    <div className="alert alert-warning">❌ {currentJob.error}</div>
                  )}

                  {/* Results Table */}
                  {currentJob.results.length > 0 ? (
                    <div className="table-container">
                      {/* Filter Bar */}
                      <div className="filter-bar">
                        {['all', 'new', 'contacted', 'interested', 'follow-up', 'rejected', 'won'].map(filter => {
                          const count = filter === 'all' 
                            ? currentJob.results.length 
                            : currentJob.results.filter(r => (leadStatuses[r.clinic_id] || 'new') === filter).length;
                          return (
                            <button 
                              key={filter}
                              className={`filter-btn ${statusFilter === filter ? 'active' : ''}`}
                              onClick={() => setStatusFilter(filter)}
                            >
                              {filter === 'all' && '📋 All'}
                              {filter === 'new' && '🆕 New'}
                              {filter === 'contacted' && '📞 Contacted'}
                              {filter === 'interested' && '🔥 Hot'}
                              {filter === 'follow-up' && '⏰ Follow Up'}
                              {filter === 'rejected' && '❌ Rejected'}
                              {filter === 'won' && '🎉 Won'}
                              <span className="count">({count})</span>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="table-actions">
                        {aiStatus?.configured && (
                          <>
                            <button 
                              className="btn btn-primary btn-sm"
                              onClick={handleScoreAllLeads}
                              disabled={isScoring}
                            >
                              {isScoring ? '⏳ Scoring...' : '🎯 Score All Leads'}
                            </button>
                            <span className="hint">AI will analyze which clinics are most likely to buy your AI voice agent</span>
                          </>
                        )}
                      </div>
                      <table className="clinics-table">
                        <thead>
                          <tr>
                            <th style={{width: '40px'}}></th>
                            <th>Clinic Name</th>
                            <th>Address</th>
                            <th>Phone</th>
                            <th>Rating</th>
                            <th>Status</th>
                            {aiStatus?.configured && <th>Score</th>}
                            <th>Links</th>
                            {aiStatus?.configured && <th>AI Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {currentJob.results
                            .filter(row => statusFilter === 'all' || (leadStatuses[row.clinic_id] || 'new') === statusFilter)
                            .map((row, idx) => (
                            <React.Fragment key={row.clinic_id || idx}>
                              <tr 
                                className={`${selectedClinic?.clinic_id === row.clinic_id ? 'selected' : ''} ${expandedRows[row.clinic_id] ? 'expanded' : ''} ${leadStatuses[row.clinic_id] === 'rejected' ? 'row-rejected' : ''}`}
                                onClick={() => toggleRowExpand(row.clinic_id)}
                              >
                                <td className="expand-cell">
                                  <button className="btn-expand" title="Show details">
                                    {expandedRows[row.clinic_id] ? '▼' : '▶'}
                                  </button>
                                </td>
                                <td className="clinic-name-cell">
                                  <div className="clinic-name-full">
                                    <strong>{row.clinic_name}</strong>
                                    {row.enriched && <span className="enriched-badge">✓ Analyzed</span>}
                                    {row.has_chatbot && <span className="chatbot-warning" title="Already has chatbot">⚠️</span>}
                                  </div>
                                </td>
                                <td className="address-cell">
                                  <span className="address-text">{row.address || '-'}</span>
                                </td>
                                <td className={row.phone_e164?.normalized ? 'phone-valid' : row.phone ? 'phone-raw' : 'phone-invalid'}>
                                  <a href={`tel:${row.phone_e164?.normalized || row.phone}`} className="phone-link">
                                    {row.phone_e164?.normalized || row.phone || '-'}
                                  </a>
                                </td>
                                <td>
                                  {row.rating ? (
                                    <span className="rating">
                                      ⭐ {row.rating} <small>({row.reviewCount || 0})</small>
                                    </span>
                                  ) : '-'}
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  <span className={`lead-status-badge ${leadStatuses[row.clinic_id] || 'new'}`}>
                                    {leadStatuses[row.clinic_id] === 'contacted' && '📞'}
                                    {leadStatuses[row.clinic_id] === 'interested' && '🔥'}
                                    {leadStatuses[row.clinic_id] === 'follow-up' && '⏰'}
                                    {leadStatuses[row.clinic_id] === 'rejected' && '❌'}
                                    {leadStatuses[row.clinic_id] === 'won' && '🎉'}
                                    {(!leadStatuses[row.clinic_id] || leadStatuses[row.clinic_id] === 'new') && '🆕'}
                                    {' '}{leadStatuses[row.clinic_id] || 'New'}
                                  </span>
                                </td>
                                {aiStatus?.configured && (
                                  <td onClick={(e) => e.stopPropagation()}>
                                    {row.leadScore ? (
                                      <div className={`lead-score grade-${row.leadScore.grade?.toLowerCase() || 'c'}`} title={`${row.leadScore.likelihood} - ${row.leadScore.suggestedPitch?.substring(0, 100)}...`}>
                                        <span className="score">{row.leadScore.score}</span>
                                        <span className="grade">{row.leadScore.grade}</span>
                                      </div>
                                    ) : (
                                      <button 
                                        className="btn-icon" 
                                        title="Score this lead with AI"
                                        onClick={(e) => { e.stopPropagation(); handleScoreLead(row); }}
                                      >
                                        🎯
                                      </button>
                                    )}
                                  </td>
                                )}
                                <td className="links-cell" onClick={(e) => e.stopPropagation()}>
                                  <div className="link-buttons">
                                    {(row.mapsUrl || row.source_url) && (
                                      <a 
                                        href={row.mapsUrl || row.source_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="btn-link maps"
                                        title="Open in Google Maps"
                                      >
                                        📍 Maps
                                      </a>
                                    )}
                                    {row.website && !row.website.includes('maps.google.com') && (
                                      <a 
                                        href={row.website} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="btn-link website"
                                        title="Visit website"
                                      >
                                        🌐 Site
                                      </a>
                                    )}
                                  </div>
                                </td>
                                {aiStatus?.configured && (
                                  <td onClick={(e) => e.stopPropagation()}>
                                    <div className="row-actions">
                                      <button className="btn-icon" title="Cold Call Script" onClick={() => handleGeneratePitch(row, 'cold-call')}>📞</button>
                                      <button className="btn-icon" title="Email Pitch" onClick={() => handleGeneratePitch(row, 'email')}>📧</button>
                                      <button className="btn-icon" title="LinkedIn Message" onClick={() => handleGeneratePitch(row, 'linkedin')}>💼</button>
                                      <button className="btn-icon" title="Analyze Fit" onClick={() => handleAnalyzeFit(row)}>🔍</button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                              {expandedRows[row.clinic_id] && (
                                <tr className="expanded-row" key={`${idx}-expanded`}>
                                  <td colSpan={aiStatus?.configured ? 9 : 7}>
                                    <div className="expanded-content">
                                      <div className="expanded-grid">
                                        <div className="expanded-item">
                                          <label>📍 Full Address</label>
                                          <span>{row.address || 'Not available'}</span>
                                        </div>
                                        <div className="expanded-item">
                                          <label>🕐 Hours</label>
                                          <span>{row.hours || 'Not available'}</span>
                                        </div>
                                        <div className="expanded-item">
                                          <label>📧 Email</label>
                                          <span>
                                            {row.email ? (
                                              <a href={`mailto:${row.email}`} className="email-link">{row.email}</a>
                                            ) : (
                                              <span style={{ color: '#9ca3af' }}>
                                                Not found 
                                                {row.website && !row.website.includes('maps.google.com') && (
                                                  <button 
                                                    className="btn btn-xs btn-outline" 
                                                    style={{ marginLeft: '0.5rem' }}
                                                    onClick={() => enrichClinicData(row)}
                                                    disabled={enrichingClinic === row.clinic_id}
                                                  >
                                                    {enrichingClinic === row.clinic_id ? '⏳ Searching...' : '🔍 Find Email'}
                                                  </button>
                                                )}
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                        <div className="expanded-item">
                                          <label>🦷 Services</label>
                                          <span>{row.services || 'Not listed'}</span>
                                        </div>
                                        
                                        {/* Enriched Data Section */}
                                        {row.enriched && (
                                          <>
                                            <div className="expanded-item">
                                              <label>🤖 Has Chatbot</label>
                                              <span className={row.has_chatbot ? 'text-warning' : 'text-success'}>
                                                {row.has_chatbot ? `⚠️ Yes - ${row.chatbot_type || 'Unknown type'}` : '✅ No - Good opportunity!'}
                                              </span>
                                            </div>
                                            <div className="expanded-item">
                                              <label>📅 Online Booking</label>
                                              <span>
                                                {row.has_online_booking ? `Yes - ${row.booking_system || 'Unknown'}` : 'No'}
                                              </span>
                                            </div>
                                            <div className="expanded-item">
                                              <label>💻 Tech Level</label>
                                              <span className={`tech-level-${row.competition_level || 'low'}`}>
                                                {row.competition_level || 'Unknown'}
                                              </span>
                                            </div>
                                            {row.tech_stack_notes && (
                                              <div className="expanded-item full-width">
                                                <label>📝 Tech Notes</label>
                                                <span>{row.tech_stack_notes}</span>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        
                                        {/* Lead Status & Notes */}
                                        <div className="expanded-item">
                                          <label>📊 Status</label>
                                          <select 
                                            value={leadStatuses[row.clinic_id] || 'new'}
                                            onChange={(e) => {
                                              const newStatuses = { ...leadStatuses, [row.clinic_id]: e.target.value };
                                              setLeadStatuses(newStatuses);
                                              localStorage.setItem('leadStatuses', JSON.stringify(newStatuses));
                                            }}
                                            className="status-select"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <option value="new">🆕 New</option>
                                            <option value="contacted">📞 Contacted</option>
                                            <option value="interested">🔥 Interested</option>
                                            <option value="follow-up">⏰ Follow Up</option>
                                            <option value="rejected">❌ Rejected</option>
                                            <option value="won">🎉 Won</option>
                                          </select>
                                        </div>
                                        
                                        {row.leadScore && (
                                          <>
                                            <div className="expanded-item full-width">
                                              <label>💡 AI Insight</label>
                                              <span>{row.leadScore.suggestedPitch}</span>
                                            </div>
                                            <div className="expanded-item">
                                              <label>✅ Reasons to Call</label>
                                              <ul>
                                                {row.leadScore.reasons?.map((r, i) => <li key={i}>{r}</li>)}
                                              </ul>
                                            </div>
                                            <div className="expanded-item">
                                              <label>⚠️ Concerns</label>
                                              <ul>
                                                {row.leadScore.concerns?.map((c, i) => <li key={i}>{c}</li>)}
                                              </ul>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      <div className="expanded-actions">
                                        {(row.mapsUrl || row.source_url) && (
                                          <a 
                                            href={row.mapsUrl || row.source_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="btn btn-outline"
                                          >
                                            📍 Open in Google Maps
                                          </a>
                                        )}
                                        {row.website && !row.website.includes('maps.google.com') && !row.enriched && (
                                          <button 
                                            className="btn btn-outline" 
                                            onClick={() => enrichClinicData(row)}
                                            disabled={enrichingClinic === row.clinic_id}
                                          >
                                            {enrichingClinic === row.clinic_id ? '⏳ Analyzing...' : '🔍 Analyze Website'}
                                          </button>
                                        )}
                                        <button className="btn btn-primary" onClick={() => handleGeneratePitch(row, 'cold-call')}>
                                          📞 Generate Call Script
                                        </button>
                                        <button className="btn btn-outline" onClick={() => handleGeneratePitch(row, 'email')}>
                                          📧 Generate Email
                                        </button>
                                        <button 
                                          className="btn btn-danger btn-sm" 
                                          onClick={() => deleteLeadPermanently(row.clinic_id)}
                                          title="Remove this lead"
                                        >
                                          🗑️ Delete
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : currentJob.status === 'running' ? (
                    <div className="empty-state">
                      <div className="icon">⏳</div>
                      <h3>Scraping...</h3>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="icon">📭</div>
                      <h3>No results</h3>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body">
                  <div className="empty-state">
                    <div className="icon">🦷</div>
                    <h3>Ready to find clinics</h3>
                    <p>Enter a location to start</p>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* AI Chat with History Sidebar */
            <div className="chat-container">
              {/* Chat History Sidebar */}
              <div className={`chat-sidebar ${showChatSidebar ? 'open' : ''}`}>
                <div className="sidebar-header">
                  <h3>💬 Chat History</h3>
                  <button className="btn-icon" onClick={() => setShowChatSidebar(false)}>✕</button>
                </div>
                <button className="btn btn-primary new-chat-btn" onClick={startNewChat}>
                  ➕ New Chat
                </button>
                <div className="history-list">
                  {chatHistories.length === 0 ? (
                    <div className="empty-history">No previous chats</div>
                  ) : (
                    chatHistories.map(h => (
                      <div 
                        key={h.id} 
                        className={`history-item ${currentChatId === h.id ? 'active' : ''}`}
                        onClick={() => loadChat(h)}
                      >
                        <div className="history-title">{h.title}</div>
                        <div className="history-meta">
                          {h.clinic && <span className="history-clinic">🦷 {h.clinic}</span>}
                          <span className="history-date">{new Date(h.timestamp).toLocaleDateString()}</span>
                        </div>
                        <button className="btn-delete" onClick={(e) => deleteChat(h.id, e)}>🗑️</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Main Chat Area */}
              <div className="card chat-card">
                <div className="card-header chat-header">
                  <div className="chat-header-left">
                    <button className="btn-icon history-toggle" onClick={() => setShowChatSidebar(!showChatSidebar)} title="Chat History">
                      📚
                    </button>
                    <span>🤖 AI Assistant</span>
                    {currentChatId && <span className="current-chat-indicator">• Viewing saved chat</span>}
                  </div>
                  <div className="chat-header-right">
                    <button className="btn btn-sm btn-outline" onClick={startNewChat}>
                      ➕ New Chat
                    </button>
                  </div>
                </div>
                <div className="card-body chat-body">
                  <div className="chat-messages">
                    {chatMessages.length === 0 && (
                      <div className="chat-welcome">
                        <div className="icon">🤖</div>
                        <h3>I'm your dental prospecting assistant</h3>
                        <p>I can help you:</p>
                        <ul>
                          <li>✉️ Write outreach emails</li>
                          <li>📞 Create call scripts</li>
                          <li>📊 Analyze leads</li>
                          <li>💡 Plan follow-ups</li>
                        </ul>
                        {currentJob?.results.length > 0 && (
                          <p className="hint">
                            💡 Tip: Click 📧 or 📞 on any clinic to generate personalized content!
                          </p>
                        )}
                        {chatHistories.length > 0 && (
                          <p className="hint">
                            📚 You have {chatHistories.length} saved chats. Click 📚 to view history.
                          </p>
                        )}
                      </div>
                    )}

                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`chat-message ${msg.role}`}>
                        <div className="message-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
                        <div className="message-content">
                          {msg.isEmail && <div className="message-label">📧 Generated Email:</div>}
                          {msg.isScript && <div className="message-label">📞 Call Script:</div>}
                          {msg.isAnalysis && <div className="message-label">🔍 Analysis:</div>}
                          <div className="message-text">{msg.content}</div>
                          {(msg.isEmail || msg.isScript || msg.role === 'assistant') && (
                            <button 
                              className="btn btn-sm btn-outline copy-btn"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                // Visual feedback
                                const btn = event.target;
                                btn.textContent = '✅ Copied!';
                                setTimeout(() => btn.textContent = '📋 Copy', 1500);
                              }}
                            >
                              📋 Copy
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {isChatLoading && (
                      <div className="chat-message assistant">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content">
                          <div className="typing-indicator"><span></span><span></span><span></span></div>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  <form className="chat-input-form" onSubmit={handleSendMessage}>
                    <input
                      type="text"
                      placeholder={aiStatus?.configured 
                        ? "Ask me to write emails, scripts, or analyze leads..."
                        : "Add GEMINI_API_KEY to .env first"
                      }
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={!aiStatus?.configured || isChatLoading}
                    />
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={!aiStatus?.configured || isChatLoading || !chatInput.trim()}
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
