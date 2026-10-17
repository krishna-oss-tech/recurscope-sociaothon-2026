import { useEffect } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Hotspot } from '../lib/types'

type Props = { hotspots: Hotspot[]; selectedId: number | null; onSelect: (id:number)=>void; compact?: boolean; defaultCenter?: [number,number] }
function distanceMeters(lat1:number,lon1:number,lat2:number,lon2:number){const toRad=(v:number)=>v*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function markerColor(status: string, band: string) {
  if (status === 'RECURRENCE_CONFIRMED' || status === 'INTERVENTION_OPEN') return '#e16c54'
  if (status === 'POSSIBLE_RETURN' || band === 'CRITICAL') return '#dc9b35'
  if (status === 'VERIFIED_RESOLVED' || status === 'MONITORING') return '#2a9d78'
  if (band === 'HIGH') return '#cc8a30'
  return '#437d83'
}
function FocusMap({hotspots,selectedId}:{hotspots:Hotspot[];selectedId:number|null}){
  const map=useMap()
  useEffect(()=>{const selected=hotspots.find(h=>h.id===selectedId);if(selected)map.flyTo([selected.latitude,selected.longitude],Math.max(map.getZoom(),15),{duration:.55})},[selectedId])
  return null
}
export default function MapView({hotspots, selectedId, onSelect, compact=false, defaultCenter}:Props) {
  const fallbackCenter: [number, number] = defaultCenter || [21.1458, 79.0882]
  const center: [number,number] = hotspots.length ? [hotspots.reduce((s,h)=>s+h.latitude,0)/hotspots.length, hotspots.reduce((s,h)=>s+h.longitude,0)/hotspots.length] : fallbackCenter
  const selected=hotspots.find(h=>h.id===selectedId)
  return <div className={`map-wrap ${compact?'map-compact':''}`}>
    <MapContainer center={center} zoom={14} scrollWheelZoom={true} zoomControl={false} className="leaflet-map">
      <FocusMap hotspots={hotspots} selectedId={selectedId}/>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ZoomControl position="bottomright" />
      {selected&&<Circle center={[selected.latitude,selected.longitude]} radius={100} pathOptions={{color:'#C7DD5A',weight:1.5,dashArray:'5 6',fillColor:'#C7DD5A',fillOpacity:.08}}/>}
      {hotspots.map(h => <CircleMarker key={h.id} center={[h.latitude,h.longitude]} radius={h.id===selectedId?11:7}
          pathOptions={{color: h.id===selectedId?'#ffffff':markerColor(h.status,h.priority.band), weight:h.id===selectedId?4:2,
          fillColor:markerColor(h.status,h.priority.band), fillOpacity:0.92}} eventHandlers={{click:()=>onSelect(h.id)}}>
        <Tooltip direction="top" offset={[0,-8]} opacity={1}><strong>{h.code}</strong><br />{h.label}<br />Priority {h.priority.score} · {h.priority.band}<br />{hotspots.filter(o=>o.id!==h.id&&distanceMeters(o.latitude,o.longitude,h.latitude,h.longitude)<=100).length} nearby candidate location(s) · review before linking</Tooltip>
      </CircleMarker>)}
    </MapContainer>
    <div className="map-legend"><span><i className="legend-dot coral"/> Recurrence</span><span><i className="legend-dot amber"/> Monitor / high</span><span><i className="legend-dot teal"/> Active / resolved</span></div>
  </div>
}
