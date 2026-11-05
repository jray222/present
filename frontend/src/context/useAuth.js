import { useContext } from 'react';
import { AuthContext } from './auth-context-def';

export const useAuth = () => useContext(AuthContext);
export default useAuth;
