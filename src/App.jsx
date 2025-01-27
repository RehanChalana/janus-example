import React from 'react';
import Janus from 'janus-gateway';
import { useState, useRef, useEffect } from 'react';
import adapter from 'webrtc-adapter';


const App = () => {

    const turnServerUsername = import.meta.env.VITE_TURN_SERVER_USERNAME
    const turnServerPassword = import.meta.env.VITE_TURN_SERVER_PASSWORD

    const [localStream, setLocalStream] = useState(null)
    const [remoteStreams, setRemoteStreams] = useState(new Map())
    const [isConnected, setIsConnected] = useState(false)
    const [subscriptions, setSubscriptions] = useState([])

    const janus = useRef(null)
    const pubHandleRef = useRef(null)
    const subHandleRef = useRef(null)
    const localVideoRef = useRef(null)

    useEffect(() => {
        const initJanus = () => {
            Janus.init({
                debug: true,
                dependencies: Janus.useDefaultDependencies({adapter: adapter}),
                callback: () => {
                    janus.current = new Janus({
                        server: "ws://send-acceptable.gl.at.ply.gg:20407",
                        iceServers: [
                            { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.l.google.com:5349" },
      { urls: "stun:stun1.l.google.com:3478" },
      { urls: "stun:stun1.l.google.com:5349" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:5349" },
      { urls: "stun:stun3.l.google.com:3478" },
      { urls: "stun:stun3.l.google.com:5349" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:5349" },
      {urls: "stun:stun.relay.metered.ca:80"},
      {
        urls: "turn:global.relay.metered.ca:80",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: turnServerUsername,
        credential: turnServerPassword,
      },
                        ],
                        success: () => { joinAsPublisher() },
                        error: () => console.error("Janus initialization error: ",error)
                    })
                }
            })
        }

        initJanus()
    },[])

    useEffect(() => {
        console.log("assigning remoteStreams")
        remoteStreams.forEach((stream, mid) => {
            const videoElement = document.getElementById(`remoteVideo-${mid}`);
            if(videoElement) {
                videoElement.srcObject = stream
            }
        })
    },[remoteStreams])


    const joinAsPublisher = () => {
        janus.current.attach(
            {
                plugin : "janus.plugin.videoroom",
                success: (pluginHandle) => {
                    pubHandleRef.current = pluginHandle
                
                    pluginHandle.send({
                        message : {
                            request : "join",
                            ptype : "publisher",
                            room : 1234
                        }      
                    })
                },
                error : (error) => console.error("Error attaching as a pub: ", error),
                onmessage : (msg, jsep) => {

                    // response of join request as publisher
                    if(msg.videoroom === "joined") {
                        // getting user media
                        navigator.mediaDevices.getUserMedia({video : true, audio : true}).then((stream) => {
                            localVideoRef.current.srcObject = stream
                            // after getting user media create a offer!
                            pubHandleRef.current.createOffer({
                                tracks: [
                                    { type: 'audio', capture: true, recv: true },
                                    { type: 'video', capture: true, recv: true },
                                ],
                                success: (jsep) => {
                                    // sending publish request with jsep
                                    pubHandleRef.current.send({
                                        message : {
                                            request : "publish"
                                        },
                                        jsep
                                    })
                                }
                            })
                        })

                        // calling to start connection to subscribe
                        joinAsSubscriber(msg.publishers)
                    }
                    else if(jsep) {
                        pubHandleRef.current.handleRemoteJsep({jsep : jsep})
                    } else if(msg.publishers) {
                        handleNewPublishers(msg.publishers)
                    }


                }

            }
        )
    }

    const joinAsSubscriber = (publishers) => {

        console.log(publishers)

        const newSubscriptions = []
        const streams = publishers.map((pub) => {
            newSubscriptions.push(pub.id)
           return ( {feed : pub.id})
        })

        setSubscriptions(newSubscriptions)

        janus.current.attach({
            plugin : "janus.plugin.videoroom",
            success: (pluginHandle) => {
                subHandleRef.current = pluginHandle,

                console.log("video room plugin connected for sub")

                pluginHandle.send({
                    message : {
                        request: "join",
                        ptype : "subscriber",
                        room: 1234,
                        streams
                    }
                })
            },

            onmessage: (msg, jsep) => {
                console.log(msg)
                if(jsep) {
                    // handle jsep offer for the sub connection
                    console.log(jsep)
                    subHandleRef.current.createAnswer({
                        jsep : jsep,
                        success: (ansJsep) => {
                            subHandleRef.current.send({
                                message : {
                                    request : "start"
                                }, jsep : ansJsep
                            })
                        }
                    }
                    )
                }

                if(msg.started === "ok") {
                    console.log("WebRTC Connection established for subscription")
                }
            },
            
            onremotetrack : (track, mid, added, metadata) => {
                console.log({
                    track,
                    mid,
                    added,
                    metadata
                })
                if(added) {
                    if(remoteStreams.has(mid)) {
                        const existingStream = remoteStreams.get(mid)
                        existingStream.addTrack(track)
                    } else {
                        const newStream = new MediaStream([track])
                        const newRemoteStreams = new Map(remoteStreams)
                        newRemoteStreams.set(mid,newStream)
                        setRemoteStreams(newRemoteStreams)
                    }
                } else {
                    if(remoteStreams.has(mid)) {
                        const existingStream = remoteStreams.get(mid)
                        existingStream.removeTrack(track)
                        if(existingStream.getTracks().length === 0) {
                            const newRemoteStreams = new Map(remoteStreams)
                            newRemoteStreams.delete(mid)
                            setRemoteStreams(newRemoteStreams)
                        }
                    }
                }
            }

        })
    }

    const handleNewPublishers = (publishers) => {
        const newSubscriptions = [...subscriptions]
        const streams = publishers.map((pub) => {
            newSubscriptions.push(pub.id)
           return ( {feed : pub.id})
        })
        setSubscriptions(newSubscriptions)

        subHandleRef.current.send({
                message : {
                    request: "join",
                    ptype : "subscriber",
                    room: 1234,
                    streams
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
            {
                Array.from(remoteStreams.keys()).map(mid => (
                    <video key = {mid} id={`remoteVideo-${mid}`} autoPlay playsInline></video>
                ))
            }
         </div>
        </div>
     );


   
    }

export default App;
