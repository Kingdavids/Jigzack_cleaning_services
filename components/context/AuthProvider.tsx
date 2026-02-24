'use client';
import {createContext, useState, useEffect} from 'react';
import client from "@/api/client";
import {listenForDynamicRequest} from "next/dist/client/components/router-reducer/ppr-navigations";

const AuthContext = createContext(null);

const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        client.auth.getSession().then(data => {
            setUser(data?.session?.user || null);
            setLoading(false);
        });

        const {data: listener} = client.auth.onAuthStateChange((e, session) =>{
            setUser(session?.user || null);
        });

        return () => {
            listener.subscription.unsubscribe();
        }
    }, []);
return (
    <AuthContext.Provider
        value ={{
            user,
            loading,
        }}
    >
        {children}
    </AuthContext.Provider>
);
};

export {AuthContext, AuthProvider};