// 设置 / AI 提供商 —— 由 reference/ui-mock.html 机械转换
import logo from "../assets/logo.png";
export default function SettingsScreen() {
  return (
    <><div className="fitter" id="screenA">
    <div className="holder">
      <div className="win-frame">
        <div className="win">

          
          <div className="titlebar">
            <div className="brand">
              <div className="brand-mark"><img src={logo} alt="" />
              </div>
              <div className="brand-name">writerD</div>
            </div>
            <div className="win-tools">
              <div className="tool-group">
                <button className="tbtn on" title="布局一"><svg viewBox="0 0 20 20" className="ic"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M13.5 4v12M2.5 8h11"/></svg></button>
                <button className="tbtn" title="布局二"><svg viewBox="0 0 20 20" className="ic"><rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/></svg></button>
              </div>
              <button className="tbtn" title="日志"><svg viewBox="0 0 20 20" className="ic"><rect x="3" y="2.5" width="14" height="15" rx="2.5"/><path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4"/></svg></button>
              <button className="tbtn bell" title="通知">
                <svg viewBox="0 0 20 20" className="ic"><path d="M10 2.5a4.6 4.6 0 0 0-4.6 4.6c0 3.6-1.4 4.7-1.4 4.7h12s-1.4-1.1-1.4-4.7A4.6 4.6 0 0 0 10 2.5z"/><path d="M8.4 14.6a1.7 1.7 0 0 0 3.2 0"/></svg>
                <span className="bell-badge">6</span>
              </button>
              <button className="tbtn" title="帮助"><svg viewBox="0 0 20 20" className="ic"><circle cx="10" cy="10" r="7.5"/><path d="M7.9 7.7a2.2 2.2 0 1 1 3 2c-.6.4-.9.8-.9 1.5"/><circle cx="10" cy="14" r=".8" className="ic-fill" stroke="none"/></svg></button>
              <div className="spacer"></div>
              <button className="tbtn" title="最小化"><svg viewBox="0 0 20 20" className="ic"><path d="M5 10h10"/></svg></button>
              <button className="tbtn" title="最大化"><svg viewBox="0 0 20 20" className="ic"><rect x="4" y="4.5" width="11" height="11" rx="2"/><path d="M6 4.5V4a1.5 1.5 0 0 1 1.5-1.5H15A1.5 1.5 0 0 1 16.5 4v7.5A1.5 1.5 0 0 1 15 13h-.5"/></svg></button>
              <button className="tbtn" title="关闭"><svg viewBox="0 0 20 20" className="ic"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg></button>
            </div>
          </div>

          
          <div className="a-head">
            <div className="vline" style={{left: "56px"}}></div>
            <div className="vline" style={{left: "181px"}}></div>
            <button className="a-back" title="返回"><svg viewBox="0 0 20 20" className="ic"><path d="M11.5 4.5L6 10l5.5 5.5"/><path d="M6.5 10h8"/></svg></button>
            <div className="a-head-icon">
              <svg viewBox="0 0 24 24" className="ic"><circle cx="12" cy="12" r="2.9"/><path d="M19.3 14.2a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.18a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.8 1.8 0 1 1 4.3 15.9l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.18a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.37-1 1.5 1.5 0 0 0-.3-1.65L4.2 7A1.8 1.8 0 1 1 6.76 4.45l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.18a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06A1.8 1.8 0 1 1 18.2 7l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.18a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.9z"/></svg>
            </div>
            <div className="a-head-title">设置</div>
          </div>

          
          <div className="a-nav">
            <button className="a-nav-item on" style={{top: "40px"}}><svg viewBox="0 0 20 20" className="ic"><rect x="2.5" y="4" width="15" height="12" rx="2.5"/><path d="M2.5 8.5h15"/></svg>AI 提供商</button>
            <button className="a-nav-item" style={{top: "92px"}}><svg viewBox="0 0 20 20" className="ic"><path d="M10 2.6l2.3 4.7 5.2.75-3.75 3.65.9 5.2L10 14.4l-4.65 2.5.9-5.2L2.5 8.05l5.2-.75L10 2.6z"/></svg>Skill</button>
            <button className="a-nav-item" style={{top: "144px"}}><svg viewBox="0 0 20 20" className="ic"><path d="M3 5.5h6M13 5.5h4M3 14.5h4M11 14.5h6"/><circle cx="11" cy="5.5" r="1.9"/><circle cx="9" cy="14.5" r="1.9"/></svg>参数</button>
            <button className="a-nav-item" style={{top: "196px"}}><svg viewBox="0 0 20 20" className="ic"><path d="M10 3a7 7 0 1 0 0 14c1 0 1.6-.7 1.6-1.5 0-.45-.2-.8-.5-1.1-.3-.3-.45-.65-.45-1.1 0-.8.7-1.45 1.55-1.45h1.35c1.4 0 2.45-1.1 2.45-2.45C16 6.4 13.3 3 10 3z"/><circle cx="7" cy="8.4" r="1" className="ic-fill" stroke="none"/><circle cx="10.6" cy="6.6" r="1" className="ic-fill" stroke="none"/></svg>主题</button>
            <button className="a-nav-item" style={{top: "248px"}}><svg viewBox="0 0 20 20" className="ic"><path d="M10 2.4l6 3.4v8.4l-6 3.4-6-3.4V5.8l6-3.4z"/><path d="M4 5.8l6 3.5 6-3.5M10 9.3V17"/></svg>VIP</button>
            <button className="a-nav-item" style={{top: "300px"}}><svg viewBox="0 0 20 20" className="ic"><path d="M3.5 10a6.5 6.5 0 0 1 11-4.7"/><path d="M16.5 10a6.5 6.5 0 0 1-11 4.7"/><path d="M14.2 2.6v3h-3M5.8 17.4v-3h3"/></svg>同步</button>
            <button className="a-nav-item" style={{top: "352px"}}><svg viewBox="0 0 20 20" className="ic"><ellipse cx="10" cy="5.4" rx="6.5" ry="2.6"/><path d="M3.5 5.4v9.2c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6V5.4"/><path d="M3.5 10c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6"/></svg>数据</button>
            <button className="a-nav-item" style={{top: "404px"}}><svg viewBox="0 0 20 20" className="ic"><circle cx="10" cy="10" r="7.5"/><path d="M10 13.6v.05"/><path d="M7.9 7.8a2.1 2.1 0 1 1 2.9 1.95c-.55.24-.8.6-.8 1.2"/></svg>关于</button>
          </div>

          
          <div className="a-content">
            <div className="a-provider-col">
              <div className="plabel">供应商</div>

              <button className="a-prow on" style={{top: "50px"}}>
                <svg viewBox="0 0 20 20" className="ic"><path d="M10 1.6l2.5 1.5 2.9-.2.9 2.8 2.4 1.7-1.3 2.6.5 2.9-2.9.6-1.9 2.2-2.7-1.05L7.6 15.6 5.6 13.5l-2.9-.5.4-2.9L1.8 7.5 4.2 5.8l1-2.8 2.9.15L10 1.6z"/><path d="M7.3 10.1l1.8 1.8 3.6-3.6" stroke="#0A0A0F" strokeWidth="2"/></svg>
                OpenWrite<span className="dot"></span>
              </button>

              <button className="a-prow" style={{top: "90px"}}>
                <svg viewBox="0 0 20 20" className="ic"><path d="M9.2 9.4l-.7-1.2-3.1-1.1a2.6 2.6 0 0 0-2.6 4.5l2.6 1.9v1.7c0 .8.6 1.4 1.4 1.4h.9l.4-2 1.6-.5"/><path d="M10.8 9.4l.7-1.2 3.1-1.1a2.6 2.6 0 0 1 2.6 4.5l-2.6 1.9v1.7c0 .8-.6 1.4-1.4 1.4h-.9l-.4-2-1.6-.5"/><path d="M8.3 7.6L10 5.2l1.7 2.4"/></svg>
                公益模型<span className="chev"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "11px", height: "11px"}}><path d="M3 4.5L6 7.5l3-3"/></svg></span>
              </button>

              <button className="a-prow" style={{top: "132px"}}>
                <svg viewBox="0 0 20 20" className="ic"><path d="M4 6.5h6.5M15 6.5h1.5M4 13.5h1.5M9 13.5h7"/><circle cx="12.4" cy="6.5" r="1.9"/><circle cx="6.4" cy="13.5" r="1.9"/></svg>
                自定义接入<span className="chev"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width: "11px", height: "11px"}}><path d="M3 4.5L6 7.5l3-3"/></svg></span>
              </button>

              <div className="a-saved">已保存</div>
            </div>

            <div className="a-detail">
              <div className="d-head">
                <div className="hdiv"></div>
                <div className="d-row">
                  <svg viewBox="0 0 20 20" className="d-logo"><path d="M10 1.6l2.5 1.5 2.9-.2.9 2.8 2.4 1.7-1.3 2.6.5 2.9-2.9.6-1.9 2.2-2.7-1.05L7.6 15.6 5.6 13.5l-2.9-.5.4-2.9L1.8 7.5 4.2 5.8l1-2.8 2.9.15L10 1.6z" className="ic-fill"/><path d="M7.3 10.1l1.8 1.8 3.6-3.6" stroke="#12121A" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div className="d-title">OpenWrite</div>
                  <div className="d-badge"><i></i>已连接</div>
                  <div className="d-right">
                    <div className="d-model">deepseek-v4-pro</div>
                    <div className="d-conn-label">连接方式</div>
                    <button className="d-conn">
                      <svg viewBox="0 0 16 16" className="ic"><circle cx="5" cy="8" r="2.6"/><path d="M7.6 8h6.2M11.4 8v2.1M9.4 8v1.6"/></svg>
                      API Key
                      <svg viewBox="0 0 12 12" className="caret" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5l3-3"/></svg>
                    </button>
                  </div>
                </div>

                <button className="pro-card">
                  <div className="pro-head">
                    <svg viewBox="0 0 20 20" className="ic"><rect x="2.8" y="4" width="14.4" height="13" rx="2.4"/><path d="M2.8 8h14.4M7 2.6v2.8M13 2.6v2.8"/></svg>
                    <b>Pro月套餐</b><span>到期：已过期</span>
                  </div>
                  <div className="pro-stats">
                    <div className="stat"><em>剩余次数</em><b>2926</b></div>
                    <div className="stat"><em>已用次数</em><b>574</b></div>
                  </div>
                  <span className="buy">
                    <svg viewBox="0 0 20 20" className="ic"><rect x="2.6" y="6" width="14.8" height="10" rx="2.2"/><path d="M2.6 9.5h14.8M6.5 6V4.4A1.4 1.4 0 0 1 7.9 3h4.2a1.4 1.4 0 0 1 1.4 1.4V6"/></svg>
                    购买新套餐
                  </span>
                </button>
              </div>

              <button className="reconnect">
                <svg viewBox="0 0 16 16" className="ic"><path d="M13.5 8a5.5 5.5 0 0 1-9.3 3.9"/><path d="M2.5 8a5.5 5.5 0 0 1 9.3-3.9"/><path d="M11.6 1.6v2.7H8.9M4.4 14.4v-2.7h2.7"/></svg>
                重新连接
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div></>
  );
}
