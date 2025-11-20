// src/App.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { Upload, Sliders, DollarSign, Zap, AlertTriangle, Cpu, Globe, Save, Trash2, History } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, orderBy, deleteDoc } from 'firebase/firestore';

// --- FIREBASE CONFIG & INITIALIZATION ---
// NOTE FOR VERCEL DEPLOYMENT: These variables are set to null/default values 
// to ensure the application builds successfully in a standard environment.
// To enable quote saving/history, replace 'firebaseConfig' with your actual config object.

const appId = 'default-app-id'; 
const firebaseConfig = null; 
const initialAuthToken = null; 

// --- DATA MODELS & CONSTANTS ---
const MATERIALS = [
  { name: 'ABS (Acrylonitrile Butadiene Styrene)', density: 1.05, pricePerKg: 3.50, factor: 0.8 },
  { name: 'PP (Polypropylene)', density: 0.90, pricePerKg: 2.10, factor: 0.5 },
  { name: 'PC (Polycarbonate)', density: 1.20, pricePerKg: 5.80, factor: 1.2 },
];
const MACHINE_RATES = [
  { size: 'Small (50-100T)', ratePerHour: 45, maxMoldSize: 300 },
  { size: 'Medium (100-250T)', ratePerHour: 65, maxMoldSize: 550 },
  { size: 'Large (250-500T)', ratePerHour: 90, maxMoldSize: 900 },
];
const MOLD_BASE_MULTIPLIER = 2.8;
const BASE_CYCLE_TIME_S = 5;
const THICKNESS_FACTOR = 4;
const SCRAP_RATE = 0.05;
const COLOR_PREMIUM_PERCENTAGE = 0.02;

// --- UTILITY FUNCTIONS ---
const formatCurrency = (value) => `$${value.toFixed(2)}`;
const getPrivateCollectionPath = (userId) => `/artifacts/${appId}/users/${userId}/quotes`;

// --- CORE CALCULATION LOGIC (Unchanged) ---
const useQuoteCalculator = (parameters, analysisData) => {
  const { materialId, quantity, cavities } = parameters;
  const material = MATERIALS.find(m => m.name === materialId) || MATERIALS[0];
  const { volume, wallThickness, dimensions } = analysisData;

  const quote = useMemo(() => {
    if (!analysisData.volume || quantity <= 0 || cavities <= 0) return null;

    // 1. MATERIAL CALCULATIONS
    const weightG = volume * material.density;
    const weightKg = weightG / 1000;
    const materialCostRaw = weightKg * material.pricePerKg;
    const colorPremium = materialCostRaw * COLOR_PREMIUM_PERCENTAGE;
    const totalMaterialCost = materialCostRaw + colorPremium;

    // 2. MACHINE CALCULATIONS
    const cycleTime = BASE_CYCLE_TIME_S + (wallThickness * THICKNESS_FACTOR);
    const partsPerShot = cavities;
    const partsPerMinute = (60 / cycleTime) * partsPerShot;
    const partsPerHour = partsPerMinute * 60;

    // 3. MOLD & MACHINE SELECTION
    const moldSizeMM = Math.max(dimensions.length, dimensions.width) * MOLD_BASE_MULTIPLIER;
    const recommendedMachine = MACHINE_RATES.find(m => moldSizeMM <= m.maxMoldSize) || MACHINE_RATES[MACHINE_RATES.length - 1];
    const machineCostPerPart = recommendedMachine.ratePerHour / partsPerHour;

    // 4. MOLD AMORTIZATION
    const moldEstimate = 10000 + (recommendedMachine.ratePerHour * 100); 
    const moldCostPerPart = moldEstimate / quantity;
    
    // 5. FINAL COST AGGREGATION
    const costBeforeScrap = totalMaterialCost + machineCostPerPart + moldCostPerPart;
    const scrapCostPerPart = costBeforeScrap * SCRAP_RATE;
    const totalPerPart = costBeforeScrap * (1 + SCRAP_RATE);
    const totalQuote = totalPerPart * quantity;
    
    return {
        materialCost: totalMaterialCost,
        machineCost: machineCostPerPart,
        moldCost: moldCostPerPart,
        colorPremium: colorPremium,
        scrapCost: scrapCostPerPart,
        totalPerPart: totalPerPart,
        cycleTime: cycleTime,
        partsPerHour: partsPerHour,
        recommendedMachine: recommendedMachine.size,
        totalQuote: totalQuote,
    };
  }, [volume, wallThickness, material.density, material.pricePerKg, quantity, cavities, material.name, material.factor, materialId, analysisData]);

  return quote;
};

// --- REACT APP COMPONENT ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [fileExtension, setFileExtension] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Firebase State
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [quoteHistory, setQuoteHistory] = useState([]);
  
  const [analysisData, setAnalysisData] = useState({ 
    volume: 0, 
    dimensions: { length: 0, width: 0, height: 0 }, 
    wallThickness: 0, 
    accuracy: 'none' 
  });

  const [parameters, setParameters] = useState({
    materialId: MATERIALS[0].name,
    quantity: 1000,
    cavities: 1,
    color: 'natural'
  });

  const quoteResults = useQuoteCalculator(parameters, analysisData);

  // 1. FIREBASE INITIALIZATION AND AUTHENTICATION
  useEffect(() => {
    if (!firebaseConfig) {
        console.warn("Firebase configuration is missing. History features are disabled.");
        setErrorMessage("Database disabled. Replace 'firebaseConfig' in App.jsx to enable saving/history.");
        setIsAuthReady(true);
        return;
    }
    
    try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authService = getAuth(app);
        
        setDb(firestore);
        setAuth(authService);

        // Sign in using custom token or anonymously if token is missing
        if (initialAuthToken) {
            signInWithCustomToken(authService, initialAuthToken)
                .catch(error => {
                    console.error("Custom token sign-in failed:", error);
                    signInAnonymously(authService);
                });
        } else {
            signInAnonymously(authService)
                .catch(error => {
                    console.error("Anonymous sign-in failed:", error);
                });
        }

        // Auth state listener
        const unsubscribe = onAuthStateChanged(authService, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                setUserId(null);
                setIsAuthReady(true);
            }
        });

        return () => unsubscribe();
    } catch (e) {
        console.error("Error initializing Firebase:", e);
        setErrorMessage("Could not initialize database services.");
    }
  }, []);

  // 2. REAL-TIME QUOTE HISTORY LISTENER
  useEffect(() => {
    if (!db || !userId) return;

    const quotesCollectionRef = collection(db, getPrivateCollectionPath(userId));
    
    const unsubscribe = onSnapshot(quotesCollectionRef, (snapshot) => {
        const history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(), 
        }));
        
        history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setQuoteHistory(history);
        
    }, (error) => {
        console.error("Error fetching quote history:", error);
        setErrorMessage("Could not load quote history from database.");
    });

    return () => unsubscribe();
  }, [db, userId]);


  // 3. SAVE QUOTE FUNCTION
  const saveCurrentQuote = async () => {
    if (!db || !userId || !quoteResults || !fileName) {
        setErrorMessage("Cannot save: Database, Analysis, or File Name missing.");
        return;
    }

    const quoteData = {
        fileName,
        fileExtension,
        createdAt: new Date(),
        analysisData,
        parameters,
        quoteResults,
        materialName: parameters.materialId,
    };

    try {
        const quotesCollectionRef = collection(db, getPrivateCollectionPath(userId));
        await addDoc(quotesCollectionRef, quoteData);
        setErrorMessage(null);
        console.log('Quote saved successfully!'); 
    } catch (error) {
        console.error("Error saving quote:", error);
        setErrorMessage(`Failed to save quote: ${error.message}`);
    }
  };
  
  // 4. DELETE QUOTE FUNCTION
  const deleteQuote = async (quoteId) => {
    if (!db || !userId) return;

    try {
      const docRef = doc(db, getPrivateCollectionPath(userId), quoteId);
      await deleteDoc(docRef);
      setErrorMessage(null);
      console.log('Quote deleted.'); 
    } catch (error) {
      console.error("Error deleting quote:", error);
      setErrorMessage(`Failed to delete quote: ${error.message}`);
    }
  };

  // Function to load a saved quote back into the main calculation panel
  const loadQuote = (quote) => {
      setFileName(quote.fileName);
      setFileExtension(quote.fileExtension);
      setAnalysisData(quote.analysisData);
      setParameters(quote.parameters);
      setIsHistoryOpen(false);
  };


  // --- HANDLERS (File Upload is updated to call the backend blueprint) ---
  const analyzeFile = async (file) => {
    setErrorMessage(null);
    setIsLoading(true);
    setAnalysisData({ volume: 0, dimensions: { length: 0, width: 0, height: 0 }, wallThickness: 0, accuracy: 'none' });

    const formData = new FormData();
    formData.append('cadFile', file);
    const endpoint = '/api/analyze'; 

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = `API analysis failed with status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMsg = errorBody.message || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const result = await response.json();
      setAnalysisData(result.analysisData);
      
    } catch (error) {
      console.error("Analysis API Error:", error);
      setErrorMessage(`File processing failed: ${error.message}. Using mock data for UI.`);
      setAnalysisData({ volume: 175.0, dimensions: { length: 60, width: 50, height: 60 }, wallThickness: 2.0, surfaceArea: 200.0, accuracy: 'mocked' });

    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const name = file.name;
    const extension = name.split('.').pop().toLowerCase();
    
    setFileName(name);
    setFileExtension(extension);
    
    analyzeFile(file);
  };

  const handleParameterChange = (key, value) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const themeClass = isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800';
  const showResults = analysisData.volume > 0 && !isLoading;

  // --- UI COMPONENTS ---
  const CostDistributionChart = ({ quote }) => {
    if (!quote) return null;
    const costs = [
      { name: 'Material Cost', value: quote.materialCost },
      { name: 'Machine Cost', value: quote.machineCost },
      { name: 'Mold Amortization', value: quote.moldCost },
      { name: 'Scrap & Premium', value: quote.scrapCost + quote.colorPremium },
    ];
    const totalCost = costs.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-indigo-400">Cost Distribution (Per Part)</h3>
        <div className="flex flex-col space-y-2">
          {costs.map((cost, index) => {
            const percentage = (cost.value / totalCost) * 100;
            const bgColor = ['bg-blue-600', 'bg-green-600', 'bg-yellow-600', 'bg-red-600'][index];
            return (
              <div key={cost.name} className="flex flex-col">
                <div className="flex justify-between text-sm">
                  <span>{cost.name}</span>
                  <span>{formatCurrency(cost.value)} ({percentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className={`${bgColor} h-2 rounded-full transition-all duration-500`} 
                    style={{ width: `${Math.max(percentage, 5)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  const AnalysisSkeleton = () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-700 rounded col-span-2"></div>
      </div>
      <div className="h-6 bg-gray-700 rounded w-1/2"></div>
    </div>
  );

  const DataCard = ({ title, value, icon: Icon, className = '' }) => (
    <div className="p-3 bg-gray-700 rounded-lg border border-gray-600 shadow-md">
        <div className="text-sm font-medium text-gray-400 flex items-center mb-1">
            {Icon && <Icon className="h-4 w-4 mr-1"/>}
            {title}
        </div>
        <p className={`text-xl font-semibold text-white truncate ${className}`}>{value}</p>
    </div>
);

const DetailedResultCard = ({ title, value, detail }) => (
    <div className="p-4 bg-gray-700 rounded-lg border border-gray-600 shadow-md">
        <p className="text-lg font-semibold text-indigo-300">{value}</p>
        <p className="text-sm font-medium text-gray-300">{title}</p>
        <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
);

  const HistoryPanel = () => (
    <div className="p-6 rounded-xl bg-gray-800 shadow-xl border border-gray-700 space-y-4">
        <h3 className="text-xl font-semibold flex items-center text-indigo-300">
            <History className="mr-2 h-5 w-5"/> Quote History ({quoteHistory.length})
        </h3>
        {isAuthReady && userId && (
            <p className="text-xs text-gray-400">
                User ID: <span className="font-mono text-xs">{userId}</span>
            </p>
        )}
        
        {quoteHistory.length === 0 ? (
            <div className="text-center p-6 text-gray-500">No saved quotes yet.</div>
        ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {quoteHistory.map((quote) => (
                    <div key={quote.id} className="p-4 bg-gray-700 rounded-lg flex justify-between items-center transition hover:bg-gray-600">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{quote.fileName}</p>
                            <p className="text-sm text-indigo-300">
                                {formatCurrency(quote.quoteResults.totalPerPart)} / Part
                            </p>
                            <p className="text-xs text-gray-400">
                                Saved: {quote.createdAt.toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0 ml-4">
                            <button 
                                onClick={() => loadQuote(quote)}
                                className="p-2 text-indigo-400 hover:text-indigo-200 transition"
                                title="Load Quote"
                            >
                                <Globe className="h-4 w-4"/>
                            </button>
                            <button 
                                onClick={() => deleteQuote(quote.id)}
                                className="p-2 text-red-400 hover:text-red-200 transition"
                                title="Delete Quote"
                            >
                                <Trash2 className="h-4 w-4"/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );


  // --- MAIN RENDER ---
  return (
    <div className={`min-h-screen font-inter ${themeClass} transition-colors duration-300 p-4 sm:p-8`}>
      <header className="flex justify-between items-center pb-6 border-b border-gray-700 mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Zap className="mr-2 h-6 w-6 text-indigo-400"/> CAD Quote Engine
        </h1>
        <div className="flex space-x-4 items-center">
            <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)} 
                className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition"
                aria-label="Toggle quote history"
            >
                <History className="h-5 w-5 text-gray-400"/>
            </button>
            <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition"
                aria-label="Toggle dark mode"
            >
                <Globe className="h-5 w-5 text-gray-400"/>
            </button>
        </div>
      </header>
      
      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-red-900/30 p-4 rounded-lg border border-red-700 mb-6 text-sm flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-3"/>
            <p className='text-red-300'>{errorMessage}</p>
        </div>
      )}

      {/* Quote History Panel (Toggled) */}
      {isHistoryOpen && (
        <div className="mb-8">
            <HistoryPanel />
        </div>
      )}


      {/* Main Content Area: Two-column layout for desktop, stacked for mobile */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Inputs & Parameters (Col 1 of 3) */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* FILE UPLOAD SECTION */}
          <div className="p-6 rounded-xl bg-gray-800 shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-indigo-300">
              <Upload className="mr-2 h-5 w-5"/> 1. Upload CAD File
            </h2>
            <div 
              className={`border-2 border-dashed ${fileName ? (analysisData.accuracy === 'high' ? 'border-green-500 bg-green-900/10' : 'border-yellow-500 bg-yellow-900/10') : 'border-gray-600 hover:border-gray-500'} rounded-lg p-8 text-center cursor-pointer transition-colors duration-200`}
              onClick={() => !isLoading && document.getElementById('cad-upload').click()}
            >
              <input 
                id="cad-upload" 
                type="file" 
                accept=".stl,.step,.stp,.iges,.sldprt,.ipt, application/sla, application/step" 
                onChange={handleFileUpload} 
                className="hidden" 
                disabled={isLoading}
              />
              <Upload className={`mx-auto h-8 w-8 mb-2 ${isLoading ? 'text-gray-500' : 'text-indigo-400'}`} />
              <p className="font-medium">{fileName || 'Drag & Drop CAD file or Click to browse'}</p>
              <p className="text-xs text-gray-400 mt-1">Supported: STL, STEP, IGES, SLDPRT, IPT, etc.</p>
            </div>
            
            {fileName && (
                <div className="mt-4 p-3 bg-gray-700 rounded-lg flex justify-between items-center text-sm">
                    <p className="truncate">File: <span className="text-indigo-300 font-mono">{fileName}</span></p>
                    {isLoading && <Cpu className="h-4 w-4 animate-spin text-yellow-500"/>}
                    {showResults && (
                        <span className={analysisData.accuracy === 'high' ? 'text-green-400' : (analysisData.accuracy === 'mocked' ? 'text-red-400' : 'text-yellow-400')}>
                            Analyzed ({analysisData.accuracy.toUpperCase()})
                        </span>
                    )}
                </div>
            )}
          </div>
          
          {/* ANALYSIS ACCURACY WARNING CARD */}
          {showResults && analysisData.accuracy !== 'high' && (
            <div className="p-4 rounded-xl bg-yellow-900/30 border border-yellow-700">
                <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3 mt-0.5 flex-shrink-0"/>
                    <div>
                        <p className="font-semibold text-yellow-300">Accuracy Notice: {analysisData.accuracy.toUpperCase()}</p>
                        <p className="text-sm text-yellow-200 mt-1">
                            The current results are based on **simulated/estimated** geometry data from the backend blueprint. 
                            **Phase 2 Goal:** Complete the Node.js/Forge integration to deliver guaranteed 'HIGH' accuracy results for all native CAD formats.
                        </p>
                    </div>
                </div>
            </div>
          )}

          {/* MANUFACTURING PARAMETERS */}
          <div className="p-6 rounded-xl bg-gray-800 shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-indigo-300">
              <Sliders className="mr-2 h-5 w-5"/> 2. Configure Parameters
            </h2>
            <div className="space-y-4">
              
              {/* Material Selection */}
              <label className="block">
                <span className="text-sm font-medium block mb-1">Material Selection</span>
                <select 
                  value={parameters.materialId} 
                  onChange={(e) => handleParameterChange('materialId', e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {MATERIALS.map(m => (
                    <option key={m.name} value={m.name}>{m.name} ({formatCurrency(m.pricePerKg)}/kg)</option>
                  ))}
                </select>
              </label>

              {/* Production Quantity */}
              <label className="block">
                <span className="text-sm font-medium block mb-1">Production Quantity (Units)</span>
                <input 
                  type="number" 
                  min="100" 
                  step="100" 
                  value={parameters.quantity} 
                  onChange={(e) => handleParameterChange('quantity', Math.max(100, parseInt(e.target.value) || 0))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </label>

              {/* Number of Cavities */}
              <label className="block">
                <span className="text-sm font-medium block mb-1">Number of Cavities</span>
                <select 
                  value={parameters.cavities} 
                  onChange={(e) => handleParameterChange('cavities', parseInt(e.target.value))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {[1, 2, 4, 8].map(c => (
                    <option key={c} value={c}>{c} Cavit{(c > 1) ? 'ies' : 'y'}</option>
                  ))}
                </select>
              </label>

              {/* Color Selection (Simple) */}
              <label className="block">
                <span className="text-sm font-medium block mb-1">Color</span>
                <select 
                  value={parameters.color} 
                  onChange={(e) => handleParameterChange('color', e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="natural">Natural (No Premium)</option>
                  <option value="black">Black (+2% Premium)</option>
                  <option value="custom">Custom Color (+2% Premium)</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Analysis & Results (Col 2/3 of 3) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* ANALYSIS DATA DISPLAY */}
          <div className="p-6 rounded-xl bg-gray-800 shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-indigo-300">
              <Cpu className="mr-2 h-5 w-5"/> 3. Part Analysis Results
            </h2>
            
            {isLoading ? <AnalysisSkeleton /> : (
              showResults ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  
                  <DataCard title="Volume" value={`${analysisData.volume.toFixed(2)} cm³`} icon={Globe}/>
                  <DataCard title="Max Wall Thk" value={`${analysisData.wallThickness.toFixed(2)} mm`} icon={Sliders}/>
                  <DataCard title="BBox (L×W×H)" value={`${analysisData.dimensions.length}×${analysisData.dimensions.width}×${analysisData.dimensions.height} mm`} icon={Cpu}/>
                  <DataCard 
                    title="Accuracy" 
                    value={analysisData.accuracy.toUpperCase()} 
                    icon={AlertTriangle} 
                    className={`text-sm font-bold ${analysisData.accuracy === 'high' ? 'text-green-400' : 'text-yellow-400'}`}
                  />
                  
                  <p className="col-span-full text-xs text-gray-400 pt-2">
                    Analysis data is fetched from the Node.js backend blueprint via /api/analyze.
                  </p>
                </div>
              ) : (
                <div className="text-center p-10 text-gray-500">
                  <AlertTriangle className="mx-auto h-12 w-12 mb-3"/>
                  <p>Upload a CAD file to start analysis and view results.</p>
                </div>
              )
            )}
          </div>

          {/* QUOTE RESULTS DISPLAY */}
          <div className="p-6 rounded-xl bg-gray-800 shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center text-indigo-300">
              <DollarSign className="mr-2 h-5 w-5"/> 4. Real-time Quote
            </h2>
            
            {quoteResults && showResults ? (
              <div className="space-y-6">
                
                {/* Primary Quote Card & Save Button */}
                <div className="bg-indigo-900/40 p-6 rounded-xl border border-indigo-700 text-center relative">
                    <button
                        onClick={saveCurrentQuote}
                        disabled={!isAuthReady || !fileName}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
                        title="Save Quote to History"
                    >
                        <Save className="h-5 w-5 text-white"/>
                    </button>

                  <p className="text-sm uppercase text-indigo-300 font-semibold">Total Cost Per Part (Fully Amortized)</p>
                  <p className="text-5xl font-extrabold my-2 text-white">{formatCurrency(quoteResults.totalPerPart)}</p>
                  <p className="text-sm text-gray-300">Total Run Cost ({parameters.quantity} parts): <span className="font-bold text-indigo-200">{formatCurrency(quoteResults.totalQuote)}</span></p>
                </div>

                {/* Detailed Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                    <DetailedResultCard title="Total Cycle Time" value={`${quoteResults.cycleTime.toFixed(1)} s`} detail="Time per shot (fill + cool)"/>
                    <DetailedResultCard title="Production Rate" value={`${quoteResults.partsPerHour.toFixed(0)} parts/hr`} detail="With all cavities considered"/>
                    <DetailedResultCard title="Recommended Press" value={quoteResults.recommendedMachine} detail="Based on estimated mold size"/>
                    <DetailedResultCard title="Total Scrap Cost" value={formatCurrency(quoteResults.scrapCost * parameters.quantity)} detail={`@ ${(SCRAP_RATE * 100).toFixed(0)}% material rate`}/>
                </div>

                {/* Cost Distribution Chart */}
                <CostDistributionChart quote={quoteResults} />

              </div>
            ) : (
              <div className="text-center p-10 text-gray-500">
                <p>Waiting for analysis and parameter configuration...</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

// Reusable UI components
const DataCard = ({ title, value, icon: Icon, className = '' }) => (
    <div className="p-3 bg-gray-700 rounded-lg border border-gray-600 shadow-md">
        <div className="text-sm font-medium text-gray-400 flex items-center mb-1">
            {Icon && <Icon className="h-4 w-4 mr-1"/>}
            {title}
        </div>
        <p className={`text-xl font-semibold text-white truncate ${className}`}>{value}</p>
    </div>
);

const DetailedResultCard = ({ title, value, detail }) => (
    <div className="p-4 bg-gray-700 rounded-lg border border-gray-600 shadow-md">
        <p className="text-lg font-semibold text-indigo-300">{value}</p>
        <p className="text-sm font-medium text-gray-300">{title}</p>
        <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
);
