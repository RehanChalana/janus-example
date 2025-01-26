import React from 'react';
import Janus from 'janus-gateway';
import { useState, useRef, useEffect } from 'react';
import adapter from 'webrtc-adapter';


const App = () => {

    const [localStream, setLocalStream] = useState(null)
    const [remoteStreams, setRemoteStreams] = useState([])
    const [isConnected, setIsConnected] = useState(false)

    const janus = useRef(null)
    const videoRoomPlugin = useRef(null)
    const localVideoRef = useRef(null)

    useEffect(() => {
        const initJanus = () => {
            Janus.init({
                debug: true,
                dependencies: Janus.useDefaultDependencies({adapter: adapter}),
                callback: () => {
                    janus.current = new Janus({
                        server: "ws://send-acceptable.gl.at.ply.gg:20407",
                        success: () => { attachVideoRoomPlugin()},
                        error: () => console.error("Janus initialization error: ",error)
                    })
                }
            })
        }

        initJanus()
    },[])

    const attachVideoRoomPlugin = () => {
        janus.current.attach({
            plugin: "janus.plugin.videoroom",
            error: () => console.error("Error attaching video room plugin: ",error),
            success: (pluginHandle) => {
                videoRoomPlugin.current = pluginHandle

                navigator.mediaDevices.getUserMedia({audio: true, video: true}).then((stream) => {
                    localVideoRef.current.srcObject = stream

                    pluginHandle.createOffer({
                        tracks: [{type : 'audio', capture: true, recv: true}, {type: 'video', capture: true, recv: true}],
                        success: (jsep) => {
                            pluginHandle.send({
                                message : {
                                    request: "join",
                                    room: 1234,
                                    ptype: "publisher",
                                }
                                ,jsep})
                        }
                    })
                })

                
            },
            onmessage: (msg,jsep) => {
                if(jsep) {
                    videoRoomPlugin.current.handleRemoteJsep({jsep : jsep})
                }

                if(msg.videoroom === "joined") {
                    console.log("joined the room")
                }
            },

            onremotetrack: (track, mid, added, metadata) => {
                setRemoteStreams((prev) => [...prev,track])
            }
        })
    }




    return (
       <div className='video-room'>
        <h2>Video Room: 1234</h2>

        <div>
            <video ref={localVideoRef} autoPlay muted></video>
        </div>

        <div>
            {remoteStreams.map((stream,index) => (
                <video
                    autoPlay
                    key = {stream.id || index}
                    srcObject = {stream}
                ></video>
            ))}
        </div>
       </div>
    );
};

export default App;
