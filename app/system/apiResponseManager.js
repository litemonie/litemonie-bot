// app/system/apiResponseManager.js
const { saveData, apiResponsesFile, systemTransactionsFile } = require('../storage/loaders');
const fs = require('fs').promises;

module.exports = function createApiResponseManager(apiResponses, systemTransactions) {
  return {
    saveResponse: async (transactionId, apiName, requestData, responseData, status = 'success') => {
      try {
        if (!apiResponses[transactionId]) {
          apiResponses[transactionId] = [];
        }
        
        const apiResponse = {
          id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          transactionId: transactionId,
          apiName: apiName,
          request: requestData,
          response: responseData,
          status: status,
          timestamp: new Date().toISOString()
        };
        
        apiResponses[transactionId].push(apiResponse);
        
        // Also link to system transaction
        const txIndex = systemTransactions.findIndex(tx => tx.id === transactionId);
        if (txIndex !== -1) {
          if (!systemTransactions[txIndex].apiResponses) {
            systemTransactions[txIndex].apiResponses = [];
          }
          systemTransactions[txIndex].apiResponses.push(apiResponse);
        }
        
        await saveData(apiResponsesFile, apiResponses);
        await saveData(systemTransactionsFile, systemTransactions);
        
        console.log(`📡 API Response saved for transaction: ${transactionId} - ${apiName}`);
        return apiResponse;
      } catch (error) {
        console.error('❌ Error saving API response:', error);
        return null;
      }
    },
    
    getResponses: (transactionId) => {
      return apiResponses[transactionId] || [];
    },
    
    getResponseDetails: (transactionId, apiName = null) => {
      const responses = apiResponses[transactionId] || [];
      if (apiName) {
        return responses.filter(r => r.apiName === apiName);
      }
      return responses;
    },
    
    clearResponses: async (transactionId) => {
      try {
        delete apiResponses[transactionId];
        await saveData(apiResponsesFile, apiResponses);
        return true;
      } catch (error) {
        console.error('❌ Error clearing API responses:', error);
        return false;
      }
    }
  };
};