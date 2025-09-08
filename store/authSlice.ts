import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  shop: string | null;
  accessToken: string | null;
  storeId: string | null;
  plan: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const initialState: AuthState = {
  shop: null,
  accessToken: null,
  storeId: null,
  plan: null,
  isAuthenticated: false,
  isLoading: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (state, action: PayloadAction<{
      shop: string;
      accessToken: string;
      storeId: string;
      plan?: string;
    }>) => {
      state.shop = action.payload.shop;
      state.accessToken = action.payload.accessToken;
      state.storeId = action.payload.storeId;
      state.plan = action.payload.plan || 'free';
      state.isAuthenticated = true;
      state.isLoading = false;
    },
    clearAuth: (state) => {
      state.shop = null;
      state.accessToken = null;
      state.storeId = null;
      state.plan = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { setAuth, clearAuth, setLoading } = authSlice.actions;
export default authSlice.reducer;