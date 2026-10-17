import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Props={latitude:number;longitude:number;focusKey:number;onPick:(latitude:number,longitude:number)=>void;defaultCenter?:[number,number]}
function ClickToPick({onPick}:{onPick:(latitude:number,longitude:number)=>void}){
  useMapEvents({click(e){onPick(e.latlng.lat,e.latlng.lng)}})
  return null
}
function FocusPoint({latitude,longitude,focusKey}:{latitude:number;longitude:number;focusKey:number}){
  const map=useMap()
  useEffect(()=>{if(focusKey>0)map.flyTo([latitude,longitude],Math.max(map.getZoom(),15),{duration:.45})},[focusKey])
  return null
}
export default function LocationPicker({latitude,longitude,focusKey,onPick,defaultCenter}:Props){
  const defLat = defaultCenter?.[0] ?? 21.1458
  const defLng = defaultCenter?.[1] ?? 79.0882
  const safeLat=Number.isFinite(latitude)?Math.max(-90,Math.min(90,latitude)):defLat
  const safeLng=Number.isFinite(longitude)?Math.max(-180,Math.min(180,longitude)):defLng
  return <div className="location-picker-wrap">
    <MapContainer center={[safeLat,safeLng]} zoom={15} scrollWheelZoom={true} zoomControl={false} className="location-picker-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      <ZoomControl position="bottomright"/>
      <FocusPoint latitude={safeLat} longitude={safeLng} focusKey={focusKey}/>
      <ClickToPick onPick={onPick}/>
      <CircleMarker center={[safeLat,safeLng]} radius={9} pathOptions={{color:'#fff',weight:3,fillColor:'#E46D47',fillOpacity:1}}/>
    </MapContainer>
    <div className="location-picker-tip"><span/> Click map to move report pin</div>
  </div>
}
