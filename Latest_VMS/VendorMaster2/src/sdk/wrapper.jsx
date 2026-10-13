import KFSDK from '@kissflow/lowcode-client-sdk'
import React, { useState, useEffect } from 'react'
import { KissflowSDKContext } from './context.jsx'

let kf
export function SDKWrapper(props) {
    const [kfInstance, setKfInstance] = useState(null)
    const [sdkFailed, setSdkFailed] = useState(false)

    useEffect(function onLoad() {
        if (window.kf) {
            kf = window.kf
            setKfInstance(window.kf)
            return
        }
        KFSDK.initialize()
            .then((sdk) => {
                window.kf = kf = sdk
                setKfInstance(sdk)
                setSdkFailed(false)
                console.info('SDK initialized successfully')
            })
            .catch((err) => {
                setSdkFailed(true)
                console.warn('SDK not available (e.g. Preview mode):', err?.message || err)
            })
    }, [])

    const sdkValue = { kf: kfInstance, sdkReady: !!kfInstance }

    // Always render the app so Preview is never blank. Show a small banner when SDK failed.
    return (
        <KissflowSDKContext.Provider value={sdkValue}>
        <React.Fragment>
            {sdkFailed && (
                <div style={{
                    padding: '8px 16px',
                    background: '#fef3c7',
                    color: '#92400e',
                    fontSize: 12,
                    textAlign: 'center',
                }}>
                    Preview mode – connect in a Kissflow app for full integration.
                </div>
            )}
            {props.children}
        </React.Fragment>
        </KissflowSDKContext.Provider>
    )
}

export { kf }
