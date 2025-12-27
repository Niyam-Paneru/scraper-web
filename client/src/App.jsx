import React, { useState, useEffect, useCallback, useRef } from 'react';

function App() {
  // State
  const [serverStatus, setServerStatus] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [apiUsage, setApiUsage] = useState(null);
  const [creditInfo, setCreditInfo] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('scraper');
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [isScoring, setIsScoring] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [enrichingClinic, setEnrichingClinic] = useState(null);
  const [toasts, setToasts] = useState([]);
  
  // New AI features state
  const [isScoringAll, setIsScoringAll] = useState(false);
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [campaignEmails, setCampaignEmails] = useState([]);
  const [leadScores, setLeadScores] = useState({});
  const [selectedClinicsForCampaign, setSelectedClinicsForCampaign] = useState([]);
  
  // Theme state
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  
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
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state - Google Places API for real data
  const [formData, setFormData] = useState({
    location: '',
    max: 20,
    webhookUrl: ''
  });

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Email Campaign state
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [previewClinic, setPreviewClinic] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendProgress, setEmailSendProgress] = useState(null);
  const [selectedEmailClinics, setSelectedEmailClinics] = useState([]);
  const [customEmails, setCustomEmails] = useState(() => {
    const saved = localStorage.getItem('customEmails');
    return saved ? JSON.parse(saved) : [];
  });
  const [newCustomEmail, setNewCustomEmail] = useState({ name: '', email: '', city: '' });
  const [removedEmailIds, setRemovedEmailIds] = useState(() => {
    const saved = localStorage.getItem('removedEmailIds');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSentEmails, setShowSentEmails] = useState(true);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Toggle theme
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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

  // Save custom emails to localStorage
  useEffect(() => {
    localStorage.setItem('customEmails', JSON.stringify(customEmails));
  }, [customEmails]);

  // Save removed email IDs to localStorage
  useEffect(() => {
    localStorage.setItem('removedEmailIds', JSON.stringify(removedEmailIds));
  }, [removedEmailIds]);

  // Lead management functions
  const updateLeadStatus = (clinicId, status) => {
    setLeadStatuses(prev => ({ ...prev, [clinicId]: status }));
  };

  const updateLeadNote = (clinicId, note) => {
    setLeadNotes(prev => ({ ...prev, [clinicId]: note }));
  };

  // Toast notification system
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Delete a job from history
  const handleDeleteJobFromHistory = async (jobId, e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== jobId));
      if (currentJob?.id === jobId) {
        setCurrentJob(null);
      }
      showToast('Job deleted', 'success');
    } catch (err) {
      showToast('Failed to delete job', 'error');
    }
  };

  // Enrich clinic data (find email, check for AI) - FIXED VERSION
  const enrichClinicData = async (clinic) => {
    if (!clinic.website) {
      showToast('No website available. Use Google search to find it first.', 'error');
      return;
    }
    
    // Skip Google Maps URLs
    if (clinic.website.includes('maps.google.com') || clinic.website.includes('goo.gl')) {
      showToast('Cannot scrape Google Maps links. Find the actual website.', 'error');
      return;
    }
    
    setEnrichingClinic(clinic.clinic_id);
    showToast(`🔍 Scraping ${clinic.clinic_name || clinic.name}...`, 'info');
    
    try {
      const res = await fetch('/api/ai/enrich-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();
      
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      
      if (data.enrichedData) {
        // Update the clinic in currentJob with enriched data
        setCurrentJob(prev => ({
          ...prev,
          results: prev.results.map(c => 
            c.clinic_id === clinic.clinic_id 
              ? { 
                  ...c, 
                  email: data.enrichedData.email || c.email,
                  emails_found: data.enrichedData.emails_found || [],
                  has_chatbot: data.enrichedData.has_chatbot,
                  chatbot_type: data.enrichedData.chatbot_type,
                  has_online_booking: data.enrichedData.has_online_booking,
                  booking_system: data.enrichedData.booking_system,
                  enriched: true,
                  enriched_source: data.source || 'scraped'
                }
              : c
          )
        }));
        
        // Show appropriate toast based on results
        if (data.enrichedData.email) {
          showToast(`✅ Found email: ${data.enrichedData.email}`, 'success');
        } else if (data.enrichedData.emails_found?.length > 0) {
          showToast(`Found ${data.enrichedData.emails_found.length} email(s)`, 'success');
        } else {
          showToast('No email found on the website', 'warning');
        }
        
        if (data.enrichedData.has_chatbot) {
          showToast(`⚠️ Has chatbot: ${data.enrichedData.chatbot_type || 'Unknown'}`, 'info');
        }
      }
    } catch (err) {
      console.error('Failed to enrich clinic:', err);
      showToast('Failed to scrape website', 'error');
    } finally {
      setEnrichingClinic(null);
    }
  };

  // Score all leads using HuggingFace AI
  const scoreAllLeads = async () => {
    if (!currentJob?.results?.length) {
      showToast('No clinics to score', 'error');
      return;
    }
    
    setIsScoringAll(true);
    showToast('🤖 Scoring all leads with AI...', 'info');
    
    try {
      const res = await fetch('/api/ai/batch-score-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinics: currentJob.results })
      });
      const data = await res.json();
      
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      
      // Update lead scores
      const scores = {};
      data.clinics.forEach(c => {
        scores[c.clinic_id] = c.leadScore;
      });
      setLeadScores(scores);
      
      showToast(`✅ Scored ${data.summary.total} leads: ${data.summary.gradeA} A, ${data.summary.gradeB} B, ${data.summary.gradeC} C`, 'success');
    } catch (err) {
      showToast('Failed to score leads', 'error');
    } finally {
      setIsScoringAll(false);
    }
  };

  // Generate email campaign using Gemini
  const generateEmailCampaign = async () => {
    const clinicsWithEmail = currentJob?.results?.filter(c => c.email) || [];
    
    if (clinicsWithEmail.length === 0) {
      showToast('No clinics with emails. Scrape emails first!', 'error');
      return;
    }
    
    setIsGeneratingCampaign(true);
    showToast('✍️ Generating personalized emails with AI...', 'info');
    
    try {
      const res = await fetch('/api/ai/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clinics: clinicsWithEmail.slice(0, 10),
          campaignType: 'introduction',
          senderInfo: { name: 'Your Name', company: 'Your Company' }
        })
      });
      const data = await res.json();
      
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      
      setCampaignEmails(data.emails);
      showToast(`✅ Generated ${data.count} personalized emails!`, 'success');
    } catch (err) {
      showToast('Failed to generate emails', 'error');
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  // Analyze competitor
  const analyzeCompetitor = async (clinic) => {
    showToast('🔍 Analyzing competitor...', 'info');
    
    try {
      const res = await fetch('/api/ai/analyze-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic })
      });
      const data = await res.json();
      
      if (data.analysis) {
        // Store in notes
        setLeadNotes(prev => ({
          ...prev,
          [clinic.clinic_id]: JSON.stringify(data.analysis, null, 2)
        }));
        showToast('✅ Analysis complete! Check notes.', 'success');
      }
    } catch (err) {
      showToast('Failed to analyze', 'error');
    }
  };

  // Toggle row expansion
  const toggleRowExpand = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  // Check server status and load usage
  const loadUsage = useCallback(() => {
    fetch('/api/ai/usage')
      .then(res => res.json())
      .then(setApiUsage)
      .catch(console.error);
    
    fetch('/api/credit')
      .then(res => res.json())
      .then(setCreditInfo)
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

    // Load email status and templates
    fetch('/api/email/status')
      .then(res => res.json())
      .then(setEmailStatus)
      .catch(() => setEmailStatus({ configured: false }));

    fetch('/api/email/templates')
      .then(res => res.json())
      .then(templates => {
        setEmailTemplates(templates);
        if (templates.length > 0 && !selectedTemplate) {
          setSelectedTemplate(templates[0]);
          setEmailSubject(templates[0].subject);
          setEmailBody(templates[0].html);
        }
      })
      .catch(console.error);

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
    if (!currentJob || currentJob.status !== 'running') {
      setIsLoading(false);
      return;
    }

    const interval = setInterval(() => {
      fetch(`/api/jobs/${currentJob.id}`)
        .then(res => res.json())
        .then(job => {
          setCurrentJob(job);
          if (job.status !== 'running') {
            setIsLoading(false);
            loadJobs();
            
            if (job.status === 'failed') {
              if (job.error?.includes('429') || job.error?.includes('rate') || job.error?.includes('limit')) {
                showToast('⚠️ API rate limited! Try using "Google Maps" source instead.', 'error');
              } else {
                showToast(job.error || 'Scraping failed', 'error');
              }
            } else if (job.results?.length > 0) {
              showToast(`Found ${job.results.length} clinics!`, 'success');
            }
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
    
    if (!serverStatus?.hasGooglePlacesKey) {
      showToast('Google Places API key required. See GOOGLE-PLACES-SETUP.md', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: formData.location,
          max: formData.max,
          webhookUrl: formData.webhookUrl
        })
      });
      const data = await res.json();
      
      if (data.error) {
        showToast(data.error, 'error');
        setIsLoading(false);
        return;
      }
      
      const { jobId } = data;

      // Poll for job completion
      const pollJob = async () => {
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        const job = await jobRes.json();
        setCurrentJob(job);
        
        if (job.status === 'running') {
          setTimeout(pollJob, 1000);
        } else if (job.status === 'failed') {
          // Check for specific errors
          if (job.error?.includes('API key')) {
            showToast('⚠️ Google Places API key error. Check your key in .env', 'error');
          } else {
            showToast(job.error || 'Scraping failed', 'error');
          }
          loadJobs();
        } else {
          loadJobs();
          if (job.results?.length > 0) {
            showToast(`✅ Found ${job.results.length} REAL clinics!`, 'success');
          } else {
            showToast('No clinics found. Try a different location.', 'warning');
          }
        }
      };
      
      pollJob();
    } catch (err) {
      console.error('Failed to start scrape:', err);
      showToast('Failed to start scrape', 'error');
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

  // Email Campaign Functions
  
  // Get clinics with emails (filtered by removed and optionally by sent status)
  const scrapedClinicsWithEmail = currentJob?.results?.filter(c => 
    c.email && 
    !removedEmailIds.includes(c.clinic_id) &&
    (showSentEmails || leadStatuses[c.clinic_id] !== 'contacted')
  ) || [];
  
  // Combine scraped clinics with custom emails
  const allEmailContacts = [
    ...scrapedClinicsWithEmail,
    ...customEmails.filter(c => 
      !removedEmailIds.includes(c.clinic_id) &&
      (showSentEmails || leadStatuses[c.clinic_id] !== 'contacted')
    )
  ];
  
  // For backward compatibility
  const clinicsWithEmail = allEmailContacts;

  // Add custom email to list
  const handleAddCustomEmail = () => {
    if (!newCustomEmail.email || !newCustomEmail.name) {
      showToast('Enter both name and email', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomEmail.email)) {
      showToast('Invalid email format', 'error');
      return;
    }
    // Check for duplicate
    const exists = [...scrapedClinicsWithEmail, ...customEmails].find(
      c => c.email.toLowerCase() === newCustomEmail.email.toLowerCase()
    );
    if (exists) {
      showToast('This email already exists', 'warning');
      return;
    }
    
    const newContact = {
      clinic_id: `custom_${Date.now()}`,
      clinic_name: newCustomEmail.name,
      name: newCustomEmail.name,
      email: newCustomEmail.email,
      city: newCustomEmail.city || '',
      isCustom: true,
      addedAt: new Date().toISOString()
    };
    
    setCustomEmails(prev => [...prev, newContact]);
    setNewCustomEmail({ name: '', email: '', city: '' });
    showToast('Email added to list', 'success');
  };

  // Remove email from list (hide it)
  const handleRemoveFromEmailList = (clinicId) => {
    setRemovedEmailIds(prev => [...prev, clinicId]);
    setSelectedEmailClinics(prev => prev.filter(c => c.clinic_id !== clinicId));
    showToast('Removed from list', 'info');
  };

  // Restore removed email
  const handleRestoreEmail = (clinicId) => {
    setRemovedEmailIds(prev => prev.filter(id => id !== clinicId));
    showToast('Restored to list', 'success');
  };

  // Clear all removed (reset)
  const handleClearRemoved = () => {
    if (confirm('Restore all removed emails to the list?')) {
      setRemovedEmailIds([]);
      showToast('All emails restored', 'success');
    }
  };
  
  // Preview email for a clinic
  const handlePreviewEmail = async (clinic) => {
    setPreviewClinic(clinic);
    try {
      const res = await fetch('/api/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: emailSubject,
          html: emailBody,
          clinic
        })
      });
      const data = await res.json();
      setPreviewHtml(data.html);
    } catch (err) {
      showToast('Failed to generate preview', 'error');
    }
  };

  // Send test email to yourself
  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      showToast('Enter your email address first', 'error');
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: emailSubject,
          html: emailBody,
          testClinic: previewClinic || {
            clinic_name: 'Test Dental Clinic',
            owner_name: 'Dr. John Smith',
            city: 'Miami',
            state: 'FL'
          }
        })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast(`✅ Test email sent to ${testEmailAddress}`, 'success');
      } else {
        showToast(data.error || 'Failed to send test email', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Send email to single clinic
  const handleSendSingleEmail = async (clinic) => {
    if (!clinic.email) {
      showToast('This clinic has no email', 'error');
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: clinic.email,
          subject: emailSubject,
          html: emailBody,
          clinic
        })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast(`✅ Email sent to ${clinic.email}`, 'success');
        // Update lead status
        updateLeadStatus(clinic.clinic_id, 'contacted');
      } else {
        showToast(data.error || 'Failed to send email', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Send bulk emails
  const handleSendBulkEmails = async () => {
    const recipients = selectedEmailClinics
      .filter(c => c.email)
      .map(c => ({ email: c.email, clinic: c }));
    
    if (recipients.length === 0) {
      showToast('No clinics with emails selected', 'error');
      return;
    }
    
    if (!confirm(`Send emails to ${recipients.length} clinics?`)) {
      return;
    }
    
    setIsSendingEmail(true);
    setEmailSendProgress({ current: 0, total: recipients.length, sent: 0, failed: 0 });
    
    try {
      const res = await fetch('/api/email/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          template: {
            subject: emailSubject,
            html: emailBody
          },
          delayMs: 2000
        })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast(`✅ Sent ${data.sent} emails (${data.failed} failed)`, 'success');
        // Update lead statuses for sent emails
        recipients.forEach(r => {
          const clinic = currentJob?.results?.find(c => c.email === r.email);
          if (clinic) {
            updateLeadStatus(clinic.clinic_id, 'contacted');
          }
        });
        setSelectedEmailClinics([]);
      } else {
        showToast(data.error || 'Failed to send emails', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSendingEmail(false);
      setEmailSendProgress(null);
    }
  };

  // Toggle clinic selection for bulk email
  const toggleClinicSelection = (clinic) => {
    setSelectedEmailClinics(prev => {
      const exists = prev.find(c => c.clinic_id === clinic.clinic_id);
      if (exists) {
        return prev.filter(c => c.clinic_id !== clinic.clinic_id);
      } else {
        return [...prev, clinic];
      }
    });
  };

  // Select all clinics with email
  const selectAllWithEmail = () => {
    if (selectedEmailClinics.length === clinicsWithEmail.length) {
      setSelectedEmailClinics([]);
    } else {
      setSelectedEmailClinics(clinicsWithEmail);
    }
  };

  // Save template
  const handleSaveTemplate = async () => {
    const name = prompt('Template name:');
    if (!name) return;
    
    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject: emailSubject,
          html: emailBody
        })
      });
      const template = await res.json();
      setEmailTemplates(prev => [...prev, template]);
      showToast('Template saved!', 'success');
    } catch (err) {
      showToast('Failed to save template', 'error');
    }
  };

  // Load template
  const handleLoadTemplate = (template) => {
    setSelectedTemplate(template);
    setEmailSubject(template.subject);
    setEmailBody(template.html);
    showToast(`Loaded: ${template.name}`, 'info');
  };

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🦷</span>
            <span className="logo-text">DentalFinder</span>
            <span className="logo-badge">PRO</span>
          </div>
        </div>
        
        <nav className="header-nav">
          <button 
            className={`nav-btn ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            <span className="nav-icon">🔍</span>
            <span>Find Clinics</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            <span className="nav-icon">📧</span>
            <span>Email Campaign</span>
            {clinicsWithEmail.length > 0 && (
              <span className="nav-badge">{clinicsWithEmail.length}</span>
            )}
          </button>
        </nav>
        
        <div className="header-right">
          <div className="api-status">
            {serverStatus?.hasGooglePlacesKey ? (
              <span className="api-badge success">
                <span className="status-dot online"></span>
                Google Places Connected
              </span>
            ) : (
              <span className="api-badge warning">
                <span className="status-dot offline"></span>
                API Key Required
              </span>
            )}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Pipeline</h3>
            <div className="pipeline-stats">
              <div className="stat-item">
                <span className="stat-dot blue"></span>
                <span className="stat-label">New</span>
                <span className="stat-count">{currentJob?.results?.filter(r => !leadStatuses[r.clinic_id] || leadStatuses[r.clinic_id] === 'new').length || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-dot yellow"></span>
                <span className="stat-label">Contacted</span>
                <span className="stat-count">{currentJob?.results?.filter(r => leadStatuses[r.clinic_id] === 'contacted').length || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-dot green"></span>
                <span className="stat-label">Interested</span>
                <span className="stat-count">{currentJob?.results?.filter(r => leadStatuses[r.clinic_id] === 'interested').length || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-dot purple"></span>
                <span className="stat-label">Won</span>
                <span className="stat-count">{currentJob?.results?.filter(r => leadStatuses[r.clinic_id] === 'won').length || 0}</span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Recent Searches</h3>
            <div className="job-list">
              {jobs.slice(0, 6).map(job => (
                <div 
                  key={job.id} 
                  className={`job-item ${currentJob?.id === job.id ? 'active' : ''}`}
                >
                  <div 
                    className="job-info"
                    onClick={() => {
                      handleLoadJob(job.id);
                      setActiveTab('scraper');
                    }}
                  >
                    <span className="job-location">{job.location}</span>
                    <span className="job-count">{job.resultCount || 0} clinics</span>
                  </div>
                  <button
                    className="job-delete"
                    onClick={(e) => handleDeleteJobFromHistory(job.id, e)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
              {jobs.length === 0 && (
                <div className="empty-jobs">No searches yet</div>
              )}
            </div>
          </div>

          {/* Google Places Credit Display */}
          <div className="sidebar-section credit-section">
            <h3 className="sidebar-title">
              <span>💳</span> Monthly Credit
            </h3>
            <div className="credit-display">
              <div className="credit-amount">
                <span className="credit-used">${creditInfo?.creditUsed?.toFixed(2) || '0.00'}</span>
                <span className="credit-separator">/</span>
                <span className="credit-total">${creditInfo?.creditTotal?.toFixed(2) || '200.00'}</span>
              </div>
              <div className="credit-bar-container">
                <div className="credit-bar">
                  <div 
                    className="credit-fill"
                    style={{ 
                      width: `${Math.min(creditInfo?.percentUsed || 0, 100)}%`,
                      backgroundColor: (creditInfo?.percentUsed || 0) > 80 ? '#ef4444' : (creditInfo?.percentUsed || 0) > 50 ? '#f59e0b' : '#22c55e'
                    }}
                  ></div>
                </div>
              </div>
              <div className="credit-stats">
                <div className="credit-stat">
                  <span className="credit-stat-value">{creditInfo?.clinicsScraped || 0}</span>
                  <span className="credit-stat-label">clinics scraped</span>
                </div>
                <div className="credit-stat">
                  <span className="credit-stat-value">~{creditInfo?.clinicsRemaining?.toLocaleString() || '4,000'}</span>
                  <span className="credit-stat-label">remaining</span>
                </div>
              </div>
              <div className="credit-reset">
                🔄 Resets in {creditInfo?.daysUntilReset || 30} days
              </div>
              {!serverStatus?.hasGooglePlacesKey && (
                <div className="credit-setup-hint">
                  <span>🔑</span> Add API key to start
                </div>
              )}
            </div>
          </div>

          {apiUsage && (
            <div className="sidebar-section usage-section">
              <h3 className="sidebar-title">AI Usage</h3>
              <div className="usage-bar-container">
                <div className="usage-bar">
                  <div 
                    className="usage-fill"
                    style={{ 
                      width: `${apiUsage.gemini?.percentUsed || 0}%`,
                    }}
                  ></div>
                </div>
                <span className="usage-text">{apiUsage.gemini?.remaining || 0} AI calls left</span>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {activeTab === 'scraper' ? (
            <>
              {/* API Status Banner */}
              {serverStatus && !serverStatus.hasGooglePlacesKey && (
                <div className="setup-banner">
                  <div className="setup-banner-content">
                    <div className="setup-icon">🔑</div>
                    <div className="setup-text">
                      <h3>Setup Required: Google Places API Key</h3>
                      <p>Add your API key to get <strong>real business data</strong> - names, phones, addresses, and websites.</p>
                    </div>
                    <div className="setup-actions">
                      <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                        Get API Key →
                      </a>
                      <span className="setup-note">Free $200/month credit</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Hero Search Section */}
              <div className="hero-search">
                <div className="hero-content">
                  <h1 className="hero-title">Find Real Dental Clinics</h1>
                  <p className="hero-subtitle">Powered by Google Places API • Real data, not fake generated content</p>
                  
                  <form onSubmit={handleSubmit} className="hero-form">
                    <div className="search-input-group">
                      <span className="search-icon">📍</span>
                      <input
                        type="text"
                        className="search-input-large"
                        placeholder="Enter city and state (e.g., Miami, FL)"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        required
                      />
                      <div className="search-count">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={formData.max}
                          onChange={(e) => setFormData({ ...formData, max: parseInt(e.target.value) || 20 })}
                          className="count-input"
                        />
                        <span className="count-label">results</span>
                      </div>
                      <button 
                        type="submit" 
                        className="btn btn-primary btn-large"
                        disabled={isLoading || !formData.location.trim() || !serverStatus?.hasGooglePlacesKey}
                      >
                        {isLoading ? (
                          <><span className="spinner"></span> Searching...</>
                        ) : (
                          <>🔍 Search</>
                        )}
                      </button>
                    </div>
                  </form>
                  
                  <div className="hero-badges">
                    <span className="hero-badge">✓ Real Business Data</span>
                    <span className="hero-badge">✓ Verified Phone Numbers</span>
                    <span className="hero-badge">✓ Google Maps Accuracy</span>
                  </div>
                </div>
              </div>

              {/* Results */}
              {currentJob ? (
                <div className="results-section">
                  <div className="results-header">
                    <div className="results-info">
                      <h2>📍 {currentJob.location}</h2>
                      <p className="results-count">
                        <span className="count-number">{currentJob.results?.length || 0}</span> dental clinics found
                        <span className="results-source">via Google Places</span>
                      </p>
                    </div>
                    <div className="results-actions">
                      <button className="btn btn-outline" onClick={handleDownloadCSV}>
                        📥 Export CSV
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={scoreAllLeads}
                        disabled={isScoringAll}
                        title="Score all leads using AI"
                      >
                        {isScoringAll ? '⏳ Scoring...' : '🎯 Score Leads'}
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={generateEmailCampaign}
                        disabled={isGeneratingCampaign || !currentJob?.results?.some(c => c.email)}
                        title="Generate personalized emails"
                      >
                        {isGeneratingCampaign ? '⏳ Generating...' : '✉️ Generate Emails'}
                      </button>
                    </div>
                  </div>

                  {/* Campaign Emails Modal */}
                  {campaignEmails.length > 0 && (
                    <div className="campaign-panel">
                      <div className="campaign-header">
                        <h3>📧 Generated Email Campaign ({campaignEmails.length} emails)</h3>
                        <button className="btn btn-sm" onClick={() => setCampaignEmails([])}>✕ Close</button>
                      </div>
                      <div className="campaign-emails">
                        {campaignEmails.map((email, idx) => (
                          <div key={idx} className="campaign-email-card">
                            <div className="email-to">To: {email.clinic} ({email.clinicEmail})</div>
                            <div className="email-subject"><strong>Subject:</strong> {email.subject}</div>
                            <div className="email-body">{email.body}</div>
                            <div className="email-actions">
                              <button 
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
                                  showToast('Copied to clipboard!', 'success');
                                }}
                              >
                                📋 Copy
                              </button>
                              <a 
                                href={`mailto:${email.clinicEmail}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                                className="btn btn-sm btn-success"
                              >
                                📤 Open in Email
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filter Pills */}
                  <div className="filter-pills">
                    {['all', 'new', 'contacted', 'interested', 'rejected', 'won'].map(filter => (
                      <button 
                        key={filter}
                        className={`pill ${statusFilter === filter ? 'active' : ''}`}
                        onClick={() => setStatusFilter(filter)}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Clinic Cards */}
                  <div className="clinic-grid">
                    {currentJob.results
                      ?.filter(row => statusFilter === 'all' || (leadStatuses[row.clinic_id] || 'new') === statusFilter)
                      .map((clinic) => (
                      <div key={clinic.clinic_id} className={`clinic-card ${expandedRows[clinic.clinic_id] ? 'expanded' : ''}`}>
                        <div className="clinic-card-main" onClick={() => toggleRowExpand(clinic.clinic_id)}>
                          <div className="clinic-header">
                            <div className="clinic-avatar">
                              {clinic.enriched ? '✓' : clinic.rating >= 4.5 ? '⭐' : '🦷'}
                            </div>
                            <div className="clinic-title">
                              <h3>{clinic.clinic_name || clinic.name}</h3>
                              <div className="clinic-rating">
                                <span className="stars">{'★'.repeat(Math.floor(clinic.rating || 0))}{'☆'.repeat(5 - Math.floor(clinic.rating || 0))}</span>
                                <span className="review-count">({clinic.reviewCount || 0})</span>
                              </div>
                            </div>
                            <div className="clinic-score">
                              {leadScores[clinic.clinic_id] ? (
                                <div className={`score-badge grade-${leadScores[clinic.clinic_id].grade}`}>
                                  {leadScores[clinic.clinic_id].grade}
                                </div>
                              ) : clinic.leadScore ? (
                                <div className="score-badge">{clinic.leadScore.score}</div>
                              ) : null}
                            </div>
                          </div>
                          
                          <div className="clinic-details">
                            <div className="detail-row">
                              <span className="detail-icon">📍</span>
                              <span className="detail-text">{clinic.address}</span>
                            </div>
                            {clinic.phone && (
                              <div className="detail-row">
                                <span className="detail-icon">📞</span>
                                <a href={`tel:${clinic.phone}`} className="detail-link" onClick={e => e.stopPropagation()}>{clinic.phone}</a>
                              </div>
                            )}
                            <div className="detail-row">
                              <span className="detail-icon">📧</span>
                              {clinic.email ? (
                                <a href={`mailto:${clinic.email}`} className="detail-link email-found" onClick={e => e.stopPropagation()}>
                                  {clinic.email}
                                  {clinic.enriched_source === 'real-scrape' && <span className="verified-badge">✓ Verified</span>}
                                </a>
                              ) : (
                                <span className="detail-text muted">
                                  No email
                                  <button 
                                    className="scrape-btn-inline"
                                    onClick={(e) => { e.stopPropagation(); enrichClinicData(clinic); }}
                                    disabled={enrichingClinic === clinic.clinic_id}
                                  >
                                    {enrichingClinic === clinic.clinic_id ? '⏳' : '🔍 Scrape'}
                                  </button>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="clinic-footer">
                            <select 
                              className="status-select"
                              value={leadStatuses[clinic.clinic_id] || 'new'}
                              onChange={(e) => { e.stopPropagation(); updateLeadStatus(clinic.clinic_id, e.target.value); }}
                              onClick={e => e.stopPropagation()}
                            >
                              <option value="new">🔵 New</option>
                              <option value="contacted">🟡 Contacted</option>
                              <option value="interested">🟢 Interested</option>
                              <option value="rejected">🔴 Rejected</option>
                              <option value="won">🟣 Won</option>
                            </select>
                            <div className="quick-actions">
                              <a 
                                href={`https://www.google.com/search?q=${encodeURIComponent((clinic.clinic_name || clinic.name) + ' ' + clinic.address + ' dental')}`}
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="action-btn"
                                onClick={e => e.stopPropagation()}
                                title="Search on Google"
                              >
                                🔍
                              </a>
                              <a 
                                href={`https://www.google.com/maps/search/${encodeURIComponent((clinic.clinic_name || clinic.name) + ' ' + clinic.address)}`}
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="action-btn"
                                onClick={e => e.stopPropagation()}
                                title="View on Maps"
                              >
                                📍
                              </a>
                              <button 
                                className="action-btn expand-indicator"
                                onClick={(e) => { e.stopPropagation(); toggleRowExpand(clinic.clinic_id); }}
                              >
                                {expandedRows[clinic.clinic_id] ? '▲' : '▼'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Panel */}
                        {expandedRows[clinic.clinic_id] && (
                          <div className="clinic-expanded">
                            <div className="expanded-grid">
                              <div className="expanded-section">
                                <h4>📋 Contact Info</h4>
                                <p><strong>Phone:</strong> {clinic.phone || 'Not found'}</p>
                                <p><strong>Website:</strong> {clinic.website ? (
                                  <a href={clinic.website.startsWith('http') ? clinic.website : `https://${clinic.website}`} target="_blank" rel="noopener noreferrer">{clinic.website}</a>
                                ) : 'Not found'}</p>
                                <p><strong>Hours:</strong> {clinic.hours || 'Not available'}</p>
                              </div>
                              
                              {clinic.enriched && (
                                <div className="expanded-section">
                                  <h4>🔍 Scraped Data</h4>
                                  <p><strong>Email:</strong> {clinic.email || 'Not found on website'}</p>
                                  {clinic.emails_found?.length > 1 && (
                                    <p><strong>All Emails:</strong> {clinic.emails_found.join(', ')}</p>
                                  )}
                                  <p><strong>Has Chatbot:</strong> {clinic.has_chatbot ? `Yes (${clinic.chatbot_type || 'Unknown'})` : 'No'}</p>
                                  <p><strong>Online Booking:</strong> {clinic.has_online_booking ? `Yes (${clinic.booking_system || 'Unknown'})` : 'No'}</p>
                                </div>
                              )}
                              
                              <div className="expanded-section">
                                <h4>📝 Notes</h4>
                                <textarea
                                  className="notes-input"
                                  placeholder="Add notes about this lead..."
                                  value={leadNotes[clinic.clinic_id] || ''}
                                  onChange={(e) => updateLeadNote(clinic.clinic_id, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            
                            <div className="expanded-actions">
                              <button 
                                className="btn btn-primary btn-sm"
                                onClick={(e) => { e.stopPropagation(); enrichClinicData(clinic); }}
                                disabled={enrichingClinic === clinic.clinic_id}
                              >
                                {enrichingClinic === clinic.clinic_id ? '⏳ Scraping...' : '🔍 Scrape Website'}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleGeneratePitch(clinic, 'email'); }}>
                                📧 Email Pitch
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleGeneratePitch(clinic, 'cold-call'); }}>
                                📞 Call Script
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleAnalyzeFit(clinic); }}>
                                📊 AI Analysis
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete ${clinic.clinic_name || clinic.name}?`)) {
                                    setCurrentJob(prev => ({
                                      ...prev,
                                      results: prev.results.filter(c => c.clinic_id !== clinic.clinic_id)
                                    }));
                                    showToast('Lead deleted', 'success');
                                  }
                                }}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <span className="empty-icon-large">🦷</span>
                    <div className="empty-circles">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                  <h2>Ready to Find Leads</h2>
                  <p>Enter a city and state above to discover dental practices with real, verified contact information.</p>
                  <div className="empty-features">
                    <div className="feature-item">
                      <span className="feature-icon">📞</span>
                      <span>Real phone numbers</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">🌐</span>
                      <span>Website URLs</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">⭐</span>
                      <span>Google ratings</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Email Campaign Tab */
            <div className="email-campaign-section">
              {/* Email Status Banner */}
              {!emailStatus?.configured && (
                <div className="setup-banner email-setup">
                  <div className="setup-banner-content">
                    <div className="setup-icon">📧</div>
                    <div className="setup-text">
                      <h3>Mailgun Setup Required</h3>
                      <p>Add your Mailgun API key to send emails. Get one at <a href="https://app.mailgun.com" target="_blank" rel="noopener noreferrer">app.mailgun.com</a></p>
                    </div>
                    <div className="setup-note">
                      Required: MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM_EMAIL
                    </div>
                  </div>
                </div>
              )}

              <div className="email-layout">
                {/* Left Panel - Email List */}
                <div className="email-list-panel">
                  <div className="panel-header">
                    <h3>📋 Email List ({clinicsWithEmail.length})</h3>
                    <div className="panel-header-actions">
                      <label className="filter-toggle" title="Show/hide already sent">
                        <input 
                          type="checkbox"
                          checked={showSentEmails}
                          onChange={() => setShowSentEmails(!showSentEmails)}
                        />
                        <span>Show sent</span>
                      </label>
                    </div>
                  </div>

                  {/* Add Custom Email Section */}
                  <div className="add-custom-email">
                    <div className="add-email-header">
                      <span>➕ Add Email Manually</span>
                    </div>
                    <div className="add-email-form">
                      <input
                        type="text"
                        placeholder="Clinic Name"
                        value={newCustomEmail.name}
                        onChange={(e) => setNewCustomEmail(prev => ({ ...prev, name: e.target.value }))}
                        className="add-email-input"
                      />
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={newCustomEmail.email}
                        onChange={(e) => setNewCustomEmail(prev => ({ ...prev, email: e.target.value }))}
                        className="add-email-input"
                      />
                      <input
                        type="text"
                        placeholder="City (optional)"
                        value={newCustomEmail.city}
                        onChange={(e) => setNewCustomEmail(prev => ({ ...prev, city: e.target.value }))}
                        className="add-email-input"
                      />
                      <button 
                        className="btn btn-sm btn-primary add-email-btn"
                        onClick={handleAddCustomEmail}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  
                  {clinicsWithEmail.length === 0 ? (
                    <div className="empty-email-list">
                      <span className="empty-icon">📭</span>
                      <p>No emails in list</p>
                      <p className="text-muted">Add emails manually or scrape clinic websites</p>
                    </div>
                  ) : (
                    <>
                      <div className="list-actions-bar">
                        <button className="btn btn-sm btn-secondary" onClick={selectAllWithEmail}>
                          {selectedEmailClinics.length === clinicsWithEmail.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {removedEmailIds.length > 0 && (
                          <button className="btn btn-sm btn-ghost" onClick={handleClearRemoved}>
                            Restore {removedEmailIds.length} removed
                          </button>
                        )}
                      </div>
                      <div className="email-clinic-list">
                        {clinicsWithEmail.map(clinic => (
                          <div 
                            key={clinic.clinic_id}
                            className={`email-clinic-item ${selectedEmailClinics.find(c => c.clinic_id === clinic.clinic_id) ? 'selected' : ''} ${previewClinic?.clinic_id === clinic.clinic_id ? 'previewing' : ''} ${leadStatuses[clinic.clinic_id] === 'contacted' ? 'already-sent' : ''}`}
                          >
                            <label className="clinic-checkbox">
                              <input 
                                type="checkbox"
                                checked={!!selectedEmailClinics.find(c => c.clinic_id === clinic.clinic_id)}
                                onChange={() => toggleClinicSelection(clinic)}
                              />
                            </label>
                            <div className="clinic-email-info" onClick={() => handlePreviewEmail(clinic)}>
                              <div className="clinic-email-name">
                                {clinic.clinic_name || clinic.name}
                                {clinic.isCustom && <span className="custom-badge">Manual</span>}
                              </div>
                              <div className="clinic-email-address">{clinic.email}</div>
                              <div className="clinic-email-meta">
                                {clinic.city && <span>{clinic.city}</span>}
                                {clinic.rating && <span>⭐ {clinic.rating}</span>}
                                {leadStatuses[clinic.clinic_id] === 'contacted' && <span className="sent-badge">✓ Sent</span>}
                              </div>
                            </div>
                            <div className="clinic-email-actions">
                              <button 
                                className="btn btn-sm btn-primary"
                                onClick={() => handleSendSingleEmail(clinic)}
                                disabled={isSendingEmail || !emailStatus?.configured || leadStatuses[clinic.clinic_id] === 'contacted'}
                                title={leadStatuses[clinic.clinic_id] === 'contacted' ? 'Already sent' : 'Send email'}
                              >
                                📤
                              </button>
                              <button 
                                className="btn btn-sm btn-ghost btn-remove"
                                onClick={() => handleRemoveFromEmailList(clinic.clinic_id)}
                                title="Remove from list"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedEmailClinics.length > 0 && (
                    <div className="bulk-send-bar">
                      <span>{selectedEmailClinics.length} selected</span>
                      <button 
                        className="btn btn-primary"
                        onClick={handleSendBulkEmails}
                        disabled={isSendingEmail || !emailStatus?.configured}
                      >
                        {isSendingEmail ? 'Sending...' : `Send to ${selectedEmailClinics.length}`}
                      </button>
                    </div>
                  )}

                  {emailSendProgress && (
                    <div className="send-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${(emailSendProgress.current / emailSendProgress.total) * 100}%` }}
                        />
                      </div>
                      <span>{emailSendProgress.current} / {emailSendProgress.total} sent</span>
                    </div>
                  )}
                </div>

                {/* Middle Panel - Template Editor */}
                <div className="email-editor-panel">
                  <div className="panel-header">
                    <h3>✏️ Email Template</h3>
                    <div className="template-actions">
                      <select 
                        className="template-select"
                        value={selectedTemplate?.id || ''}
                        onChange={(e) => {
                          const t = emailTemplates.find(t => t.id === e.target.value);
                          if (t) handleLoadTemplate(t);
                        }}
                      >
                        {emailTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button className="btn btn-sm btn-secondary" onClick={handleSaveTemplate}>
                        💾 Save
                      </button>
                    </div>
                  </div>

                  <div className="email-editor">
                    <div className="form-group">
                      <label>Subject Line</label>
                      <input
                        type="text"
                        className="form-control"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Quick question for {{clinic_name}}"
                      />
                    </div>
                    <div className="form-group">
                      <label>Email Body <span className="label-hint">(plain text - line breaks will be preserved)</span></label>
                      <textarea
                        className="email-body-editor"
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Hi {{owner_name}},

I came across {{clinic_name}} and wanted to reach out...

Best regards,
Your Name"
                        rows={12}
                      />
                    </div>
                    <div className="template-variables">
                      <span className="var-label">Click to insert:</span>
                      {['{{clinic_name}}', '{{owner_name}}', '{{city}}', '{{rating}}', '{{website}}'].map(v => (
                        <button 
                          key={v}
                          className="var-btn"
                          onClick={() => setEmailBody(prev => prev + ' ' + v)}
                        >
                          {v.replace(/\{|\}/g, '')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Send Section */}
                  <div className="quick-send-section">
                    <h4>📨 Quick Send</h4>
                    <p className="quick-send-desc">Send a test to yourself or to any email address</p>
                    <div className="quick-send-form">
                      <input
                        type="email"
                        className="form-control"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        placeholder="Enter any email address..."
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={handleSendTestEmail}
                        disabled={isSendingEmail || !emailStatus?.configured || !testEmailAddress}
                      >
                        {isSendingEmail ? 'Sending...' : 'Send →'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Preview */}
                <div className="email-preview-panel">
                  <div className="panel-header">
                    <h3>👁️ Live Preview</h3>
                    {previewClinic && (
                      <span className="preview-for">for {previewClinic.clinic_name || previewClinic.name}</span>
                    )}
                  </div>
                  
                  <div className="email-preview">
                    {previewHtml ? (
                      <div className="preview-content">
                        <div className="preview-meta">
                          <div className="preview-meta-row">
                            <span className="preview-label">To:</span>
                            <span>{previewClinic?.email}</span>
                          </div>
                          <div className="preview-meta-row">
                            <span className="preview-label">From:</span>
                            <span>{emailStatus?.fromEmail || 'founder@dentsignal.me'}</span>
                          </div>
                          <div className="preview-meta-row">
                            <span className="preview-label">Subject:</span>
                            <span className="preview-subject">{emailSubject.replace(/\{\{clinic_name\}\}/g, previewClinic?.clinic_name || previewClinic?.name || 'Clinic')}</span>
                          </div>
                        </div>
                        <div 
                          className="preview-body"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      </div>
                    ) : (
                      <div className="preview-empty">
                        <span className="preview-icon">👈</span>
                        <p>Select a contact to preview the personalized email</p>
                      </div>
                    )}
                  </div>

                  {/* Mailgun Status */}
                  <div className="mailgun-status">
                    <div className="status-header">
                      <span className={`status-dot-large ${emailStatus?.configured ? 'online' : 'offline'}`}></span>
                      <span className="status-text">{emailStatus?.configured ? 'Mailgun Connected' : 'Not Connected'}</span>
                    </div>
                    {emailStatus?.configured && (
                      <div className="status-details">
                        <div><span className="dim">Domain:</span> {emailStatus.domain}</div>
                        <div><span className="dim">From:</span> {emailStatus.fromEmail}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
