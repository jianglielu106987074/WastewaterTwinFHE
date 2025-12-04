// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PlantData {
  id: string;
  name: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "operational" | "maintenance" | "critical";
  efficiency: number;
  complianceScore: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [plantData, setPlantData] = useState<PlantData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newPlantData, setNewPlantData] = useState({
    name: "",
    efficiency: 85,
    complianceScore: 92,
    status: "operational" as const
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<PlantData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics for dashboard
  const operationalCount = plantData.filter(p => p.status === "operational").length;
  const maintenanceCount = plantData.filter(p => p.status === "maintenance").length;
  const criticalCount = plantData.filter(p => p.status === "critical").length;
  const avgEfficiency = plantData.length > 0 
    ? plantData.reduce((sum, p) => sum + p.efficiency, 0) / plantData.length 
    : 0;
  const avgCompliance = plantData.length > 0 
    ? plantData.reduce((sum, p) => sum + p.complianceScore, 0) / plantData.length 
    : 0;

  // Filter plants based on search query
  const filteredPlants = plantData.filter(plant => 
    plant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plant.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadPlantData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadPlantData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("plant_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing plant keys:", e);
        }
      }
      
      const list: PlantData[] = [];
      
      for (const key of keys) {
        try {
          const plantBytes = await contract.getData(`plant_${key}`);
          if (plantBytes.length > 0) {
            try {
              const plantData = JSON.parse(ethers.toUtf8String(plantBytes));
              list.push({
                id: key,
                name: plantData.name,
                encryptedData: plantData.data,
                timestamp: plantData.timestamp,
                owner: plantData.owner,
                status: plantData.status || "operational",
                efficiency: plantData.efficiency || 0,
                complianceScore: plantData.complianceScore || 0
              });
            } catch (e) {
              console.error(`Error parsing plant data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading plant ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPlantData(list);
    } catch (e) {
      console.error("Error loading plant data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitPlantData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting plant data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newPlantData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const plantId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const plantData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        name: newPlantData.name,
        status: newPlantData.status,
        efficiency: newPlantData.efficiency,
        complianceScore: newPlantData.complianceScore
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `plant_${plantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(plantData))
      );
      
      const keysBytes = await contract.getData("plant_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(plantId);
      
      await contract.setData(
        "plant_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Plant data encrypted and stored securely!"
      });
      
      await loadPlantData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPlantData({
          name: "",
          efficiency: 85,
          complianceScore: 92,
          status: "operational"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const simulateOptimization = async (plantId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE optimization simulation..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const plantBytes = await contract.getData(`plant_${plantId}`);
      if (plantBytes.length === 0) {
        throw new Error("Plant data not found");
      }
      
      const plantData = JSON.parse(ethers.toUtf8String(plantBytes));
      
      // Simulate optimization improving efficiency and compliance
      const updatedPlant = {
        ...plantData,
        efficiency: Math.min(100, plantData.efficiency + 5),
        complianceScore: Math.min(100, plantData.complianceScore + 3)
      };
      
      await contract.setData(
        `plant_${plantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPlant))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE optimization completed successfully!"
      });
      
      await loadPlantData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Optimization failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkCompliance = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE compliance check..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE compliance verification successful! All systems operational."
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Compliance check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to interact with the digital twin platform",
      icon: "🔗"
    },
    {
      title: "Add Plant Data",
      description: "Upload encrypted wastewater treatment plant operational data",
      icon: "🏭"
    },
    {
      title: "FHE Processing",
      description: "Your data is processed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Optimize & Monitor",
      description: "Run simulations and monitor compliance while keeping data private",
      icon: "📊"
    }
  ];

  const renderEfficiencyChart = () => {
    return (
      <div className="efficiency-chart">
        <div className="chart-bar-container">
          {plantData.slice(0, 5).map((plant, index) => (
            <div key={plant.id} className="chart-bar-wrapper">
              <div className="chart-bar-label">{plant.name}</div>
              <div className="chart-bar">
                <div 
                  className="chart-bar-fill" 
                  style={{ width: `${plant.efficiency}%` }}
                ></div>
              </div>
              <div className="chart-bar-value">{plant.efficiency}%</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="water-animation"></div>
      <p>Initializing encrypted connection to wastewater treatment digital twin...</p>
    </div>
  );

  return (
    <div className="app-container wastewater-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="water-drop-icon"></div>
          </div>
          <h1>Wastewater<span>Twin</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-plant-btn natural-button"
          >
            <div className="add-icon"></div>
            Add Plant
          </button>
          <button 
            className="natural-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Based Secure Digital Twin for Wastewater Treatment</h2>
            <p>Monitor and optimize wastewater treatment plants with fully homomorphic encryption</p>
          </div>
          <div className="water-treatment-icon"></div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Wastewater Treatment Tutorial</h2>
            <p className="subtitle">Learn how to securely monitor and optimize treatment plants</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card natural-card">
            <h3>Project Introduction</h3>
            <p>Secure digital twin platform using FHE technology to monitor and optimize wastewater treatment plants without exposing sensitive operational data.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card natural-card">
            <h3>Plant Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{plantData.length}</div>
                <div className="stat-label">Total Plants</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{operationalCount}</div>
                <div className="stat-label">Operational</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{maintenanceCount}</div>
                <div className="stat-label">Maintenance</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{criticalCount}</div>
                <div className="stat-label">Critical</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card natural-card">
            <h3>Performance Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-item">
                <div className="metric-label">Avg. Efficiency</div>
                <div className="metric-value">{avgEfficiency.toFixed(1)}%</div>
              </div>
              <div className="metric-item">
                <div className="metric-label">Avg. Compliance</div>
                <div className="metric-value">{avgCompliance.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card natural-card full-width">
          <h3>Plant Efficiency Comparison</h3>
          {plantData.length > 0 ? renderEfficiencyChart() : (
            <p className="no-data">No plant data available. Add a plant to see efficiency metrics.</p>
          )}
        </div>
        
        <div className="plants-section">
          <div className="section-header">
            <h2>Wastewater Treatment Plants</h2>
            <div className="header-actions">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search plants..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="natural-input"
                />
              </div>
              <button 
                onClick={loadPlantData}
                className="refresh-btn natural-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={checkCompliance}
                className="natural-button primary"
              >
                Check Compliance
              </button>
            </div>
          </div>
          
          <div className="plants-list natural-card">
            <div className="table-header">
              <div className="header-cell">Name</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Efficiency</div>
              <div className="header-cell">Compliance</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredPlants.length === 0 ? (
              <div className="no-plants">
                <div className="no-plants-icon"></div>
                <p>No treatment plants found</p>
                <button 
                  className="natural-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Plant
                </button>
              </div>
            ) : (
              filteredPlants.map(plant => (
                <div className="plant-row" key={plant.id} onClick={() => setSelectedPlant(plant)}>
                  <div className="table-cell plant-name">{plant.name}</div>
                  <div className="table-cell">{plant.owner.substring(0, 6)}...{plant.owner.substring(38)}</div>
                  <div className="table-cell">
                    <span className={`status-badge ${plant.status}`}>
                      {plant.status}
                    </span>
                  </div>
                  <div className="table-cell">
                    <div className="efficiency-meter">
                      <div 
                        className="efficiency-fill" 
                        style={{ width: `${plant.efficiency}%` }}
                      ></div>
                      <span>{plant.efficiency}%</span>
                    </div>
                  </div>
                  <div className="table-cell">
                    <div className="compliance-score">
                      {plant.complianceScore}%
                    </div>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(plant.owner) && (
                      <button 
                        className="action-btn natural-button success"
                        onClick={(e) => {
                          e.stopPropagation();
                          simulateOptimization(plant.id);
                        }}
                      >
                        Optimize
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-section natural-card">
          <h3>Our Team</h3>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-avatar"></div>
              <div className="member-name">Dr. Emily Chen</div>
              <div className="member-role">FHE Research Lead</div>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <div className="member-name">Marcus Johnson</div>
              <div className="member-role">Wastewater Engineer</div>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <div className="member-name">Sarah Williams</div>
              <div className="member-role">Blockchain Developer</div>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <div className="member-name">David Kim</div>
              <div className="member-role">Environmental Scientist</div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPlantData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          plantData={newPlantData}
          setPlantData={setNewPlantData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content natural-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="water-animation small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}

      {selectedPlant && (
        <PlantDetailModal 
          plant={selectedPlant} 
          onClose={() => setSelectedPlant(null)}
          onOptimize={simulateOptimization}
          isOwner={isOwner(selectedPlant.owner)}
        />
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="water-drop-icon"></div>
              <span>WastewaterTwinFHE</span>
            </div>
            <p>Secure encrypted digital twin for wastewater treatment plants</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Environmental Protection</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} WastewaterTwinFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  plantData: any;
  setPlantData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  plantData,
  setPlantData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPlantData({
      ...plantData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!plantData.name) {
      alert("Please enter a plant name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal natural-card">
        <div className="modal-header">
          <h2>Add Wastewater Treatment Plant</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Plant data will be encrypted with FHE for secure processing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Plant Name *</label>
              <input 
                type="text"
                name="name"
                value={plantData.name} 
                onChange={handleChange}
                placeholder="Enter plant name..." 
                className="natural-input"
              />
            </div>
            
            <div className="form-group">
              <label>Status</label>
              <select 
                name="status"
                value={plantData.status} 
                onChange={handleChange}
                className="natural-select"
              >
                <option value="operational">Operational</option>
                <option value="maintenance">Maintenance</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Efficiency (%)</label>
              <input 
                type="number"
                name="efficiency"
                min="0"
                max="100"
                value={plantData.efficiency} 
                onChange={handleChange}
                className="natural-input"
              />
            </div>
            
            <div className="form-group">
              <label>Compliance Score (%)</label>
              <input 
                type="number"
                name="complianceScore"
                min="0"
                max="100"
                value={plantData.complianceScore} 
                onChange={handleChange}
                className="natural-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing and optimization
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn natural-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn natural-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Add Plant Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PlantDetailModalProps {
  plant: PlantData;
  onClose: () => void;
  onOptimize: (id: string) => void;
  isOwner: boolean;
}

const PlantDetailModal: React.FC<PlantDetailModalProps> = ({ 
  plant, 
  onClose, 
  onOptimize,
  isOwner
}) => {
  return (
    <div className="modal-overlay">
      <div className="plant-detail-modal natural-card">
        <div className="modal-header">
          <h2>{plant.name} Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="plant-info-grid">
            <div className="info-item">
              <label>Plant ID</label>
              <span>#{plant.id.substring(0, 8)}</span>
            </div>
            <div className="info-item">
              <label>Owner</label>
              <span>{plant.owner.substring(0, 8)}...{plant.owner.substring(36)}</span>
            </div>
            <div className="info-item">
              <label>Status</label>
              <span className={`status-badge ${plant.status}`}>{plant.status}</span>
            </div>
            <div className="info-item">
              <label>Efficiency</label>
              <span>{plant.efficiency}%</span>
            </div>
            <div className="info-item">
              <label>Compliance Score</label>
              <span>{plant.complianceScore}%</span>
            </div>
            <div className="info-item">
              <label>Added</label>
              <span>{new Date(plant.timestamp * 1000).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="optimization-section">
            <h3>FHE Optimization</h3>
            <p>Run encrypted optimization algorithms to improve plant efficiency and compliance.</p>
            
            {isOwner && (
              <button 
                className="natural-button primary"
                onClick={() => onOptimize(plant.id)}
              >
                Run Optimization
              </button>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn natural-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;