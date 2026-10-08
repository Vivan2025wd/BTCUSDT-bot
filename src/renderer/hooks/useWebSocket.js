import { useState, useEffect, useRef } from 'react';

const useWebSocket = (url, options = {}) => {
  const [socket, setSocket] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Closed');
  const [messageHistory, setMessageHistory] = useState([]);
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = options.maxReconnectAttempts || 5;
  const reconnectInterval = options.reconnectInterval || 3000;

  useEffect(() => {
    if (!url) return;

    const connect = () => {
      try {
        socketRef.current = new WebSocket(url);
        setSocket(socketRef.current);

        socketRef.current.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('Open');
          reconnectAttempts.current = 0;
          
          if (options.onOpen) {
            options.onOpen();
          }
        };

        socketRef.current.onmessage = (event) => {
          const message = JSON.parse(event.data);
          setLastMessage(message);
          
          if (options.filter && !options.filter(message)) {
            return;
          }

          setMessageHistory(prev => {
            const newHistory = [...prev, message];
            return newHistory.slice(-100); // Keep last 100 messages
          });

          if (options.onMessage) {
            options.onMessage(message);
          }
        };

        socketRef.current.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          setConnectionStatus('Closed');
          
          if (options.onClose) {
            options.onClose(event);
          }

          // Auto-reconnect logic
          if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            console.log(`Attempting to reconnect... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectInterval);
          }
        };

        socketRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('Error');
          
          if (options.onError) {
            options.onError(error);
          }
        };

      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        setConnectionStatus('Error');
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [url]);

  const sendMessage = (message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      socketRef.current.send(messageStr);
      return true;
    }
    console.warn('WebSocket is not open. Message not sent:', message);
    return false;
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socketRef.current) {
      socketRef.current.close(1000, 'Manual disconnect');
    }
  };

  return {
    socket,
    lastMessage,
    messageHistory,
    connectionStatus,
    sendMessage,
    disconnect
  };
};

export default useWebSocket;
