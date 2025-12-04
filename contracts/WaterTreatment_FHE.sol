// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WaterTreatment_FHE is SepoliaConfig {
    struct EncryptedPlantData {
        uint256 plantId;
        euint32 encryptedInflowRate;
        euint32 encryptedChemicalLevels;
        euint32 encryptedTurbidity;
        euint32 encryptedBacterialCount;
        uint256 timestamp;
        address plantOperator;
    }

    struct DecryptedPlantData {
        uint32 inflowRate;
        uint32 chemicalLevels;
        uint32 turbidity;
        uint32 bacterialCount;
        bool isRevealed;
    }

    struct TreatmentOptimization {
        euint32 encryptedChemicalDosage;
        euint32 encryptedFlowAdjustment;
        euint32 encryptedEfficiencyScore;
    }

    uint256 public plantCount;
    mapping(uint256 => EncryptedPlantData) public encryptedPlantData;
    mapping(uint256 => DecryptedPlantData) public decryptedPlantData;
    mapping(uint256 => TreatmentOptimization) public treatmentOptimizations;

    mapping(uint256 => uint256) private requestToPlantId;
    
    event PlantDataSubmitted(uint256 indexed plantId, address indexed operator, uint256 timestamp);
    event OptimizationCalculated(uint256 indexed plantId);
    event PlantDataDecrypted(uint256 indexed plantId);

    function registerPlant(address operator) public returns (uint256) {
        plantCount += 1;
        return plantCount;
    }

    function submitEncryptedPlantData(
        euint32 encryptedInflowRate,
        euint32 encryptedChemicalLevels,
        euint32 encryptedTurbidity,
        euint32 encryptedBacterialCount,
        address operator
    ) public {
        uint256 plantId = registerPlant(operator);
        
        encryptedPlantData[plantId] = EncryptedPlantData({
            plantId: plantId,
            encryptedInflowRate: encryptedInflowRate,
            encryptedChemicalLevels: encryptedChemicalLevels,
            encryptedTurbidity: encryptedTurbidity,
            encryptedBacterialCount: encryptedBacterialCount,
            timestamp: block.timestamp,
            plantOperator: operator
        });

        decryptedPlantData[plantId] = DecryptedPlantData({
            inflowRate: 0,
            chemicalLevels: 0,
            turbidity: 0,
            bacterialCount: 0,
            isRevealed: false
        });

        calculateOptimization(plantId);
        emit PlantDataSubmitted(plantId, operator, block.timestamp);
    }

    function calculateOptimization(uint256 plantId) private {
        EncryptedPlantData storage data = encryptedPlantData[plantId];
        
        treatmentOptimizations[plantId] = TreatmentOptimization({
            encryptedChemicalDosage: FHE.add(
                FHE.mul(data.encryptedChemicalLevels, FHE.asEuint32(2)),
                FHE.div(data.encryptedBacterialCount, FHE.asEuint32(10))
            ),
            encryptedFlowAdjustment: FHE.sub(
                FHE.asEuint32(100),
                FHE.div(data.encryptedInflowRate, FHE.asEuint32(5))
            ),
            encryptedEfficiencyScore: FHE.div(
                FHE.add(
                    FHE.sub(FHE.asEuint32(100), data.encryptedTurbidity),
                    data.encryptedChemicalLevels
                ),
                FHE.asEuint32(2)
            )
        });

        emit OptimizationCalculated(plantId);
    }

    function requestPlantDataDecryption(uint256 plantId) public {
        require(msg.sender == encryptedPlantData[plantId].plantOperator, "Not operator");
        require(!decryptedPlantData[plantId].isRevealed, "Already decrypted");

        EncryptedPlantData storage data = encryptedPlantData[plantId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(data.encryptedInflowRate);
        ciphertexts[1] = FHE.toBytes32(data.encryptedChemicalLevels);
        ciphertexts[2] = FHE.toBytes32(data.encryptedTurbidity);
        ciphertexts[3] = FHE.toBytes32(data.encryptedBacterialCount);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPlantData.selector);
        requestToPlantId[reqId] = plantId;
    }

    function decryptPlantData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 plantId = requestToPlantId[requestId];
        require(plantId != 0, "Invalid request");

        DecryptedPlantData storage dData = decryptedPlantData[plantId];
        require(!dData.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        (uint32 inflow, uint32 chemicals, uint32 turbidity, uint32 bacteria) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        
        dData.inflowRate = inflow;
        dData.chemicalLevels = chemicals;
        dData.turbidity = turbidity;
        dData.bacterialCount = bacteria;
        dData.isRevealed = true;

        emit PlantDataDecrypted(plantId);
    }

    function requestOptimizationDecryption(uint256 plantId) public {
        require(msg.sender == encryptedPlantData[plantId].plantOperator, "Not operator");
        
        TreatmentOptimization storage optimization = treatmentOptimizations[plantId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(optimization.encryptedChemicalDosage);
        ciphertexts[1] = FHE.toBytes32(optimization.encryptedFlowAdjustment);
        ciphertexts[2] = FHE.toBytes32(optimization.encryptedEfficiencyScore);
        
        FHE.requestDecryption(ciphertexts, this.decryptOptimization.selector);
    }

    function decryptOptimization(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        (uint32 dosage, uint32 flow, uint32 efficiency) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        // Process decrypted optimization as needed
    }

    function getPlantCount() public view returns (uint256) {
        return plantCount;
    }
}