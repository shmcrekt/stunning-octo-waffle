// api/poll-status.js
// Endpoint called by the client to check the status of a long-running Forge job.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  // Get jobId from query parameter
  const jobId = req.query.jobId;

  if (!jobId) {
    return res.status(400).json({ message: 'Missing jobId query parameter.' });
  }

  // --- DATA RETRIEVAL (BLUEPRINT) ---
  // MOCK DATA STORAGE (Replace with Redis or Firestore read):
  const MOCK_STORAGE = global.MOCK_STORAGE || {};
  
  // Check the shared storage for the result
  const jobResult = MOCK_STORAGE[jobId];

  if (jobResult) {
    // Job found and status determined by the webhook handler
    return res.status(200).json(jobResult);
  } else {
    // Job started but webhook hasn't fired yet
    return res.status(200).json({ status: 'in-progress', analysisData: null });
  }
}
