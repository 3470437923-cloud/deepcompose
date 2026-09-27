// 主界面 —— 由 reference/ui-mock.html 机械转换
import logo from "../assets/logo.png";
export default function MainScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <><div className="fitter" id="screenB">
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
                <button className="tbtn" title="布局一"><svg viewBox="0 0 20 20" className="ic"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M13.5 4v12M2.5 8h11"/></svg></button>
                <button className="tbtn on" title="布局二"><svg viewBox="0 0 20 20" className="ic"><rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15"/></svg></button>
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

          <div className="b-body">

            
            <div className="b-left">
              <div className="b-left-head">
                <svg viewBox="0 0 20 20" className="ic"><path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h6.3l5.1 5.1v7.3A1.6 1.6 0 0 1 14.4 17H4.6A1.6 1.6 0 0 1 3 15.4V4.6z" transform="translate(-1.2,0)"/></svg>
                <div className="ttl">对话列表</div>
                <button className="b-icon-btn" title="管理"><svg viewBox="0 0 20 20" className="ic"><path d="M4 6h8M4 10h8M4 14h5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="14" r="1.5"/></svg></button>
                <button className="b-icon-btn accent" title="新建对话"><svg viewBox="0 0 20 20" className="ic"><path d="M10 4.5v11M4.5 10h11"/></svg></button>
              </div>
              <div className="b-day">今天</div>
              <button className="b-conv" style={{top: "130px"}}><em style={{fontStyle: "normal"}}>新对话</em><span>5 分钟前</span></button>
              <button className="b-conv" style={{top: "162px"}}><em style={{fontStyle: "normal"}}>新对话</em><span>5 分钟前</span></button>
              <button className="b-conv" style={{top: "194px"}}><em style={{fontStyle: "normal"}}>新对话</em><span>5 分钟前</span></button>

              <div className="b-user">
                <div className="b-user-avatar">
                  <svg viewBox="0 0 20 20" className="ic-fill"><circle cx="10" cy="7" r="3.1"/><path d="M3.6 17.2c.6-3.2 3.2-5 6.4-5s5.8 1.8 6.4 5z"/></svg>
                </div>
                <div className="uname">套…</div>
                <div className="tag">套餐</div>
                <button className="b-icon-btn gear" title="设置" onClick={onOpenSettings}><svg viewBox="0 0 20 20" className="ic"><circle cx="10" cy="10" r="2.4"/><path d="M16.1 11.9a1.25 1.25 0 0 0 .25 1.38l.04.05a1.5 1.5 0 1 1-2.12 2.12l-.05-.04a1.25 1.25 0 0 0-1.38-.25 1.25 1.25 0 0 0-.75 1.14v.15a1.5 1.5 0 1 1-3 0v-.08a1.25 1.25 0 0 0-.82-1.14 1.25 1.25 0 0 0-1.38.25l-.05.04A1.5 1.5 0 1 1 3.9 13.4l.04-.05a1.25 1.25 0 0 0 .25-1.38 1.25 1.25 0 0 0-1.14-.75h-.15a1.5 1.5 0 1 1 0-3h.08a1.25 1.25 0 0 0 1.14-.82 1.25 1.25 0 0 0-.25-1.38L3.9 5.97A1.5 1.5 0 1 1 6.02 3.85l.05.04a1.25 1.25 0 0 0 1.38.25h.06a1.25 1.25 0 0 0 .75-1.14v-.15a1.5 1.5 0 1 1 3 0v.08a1.25 1.25 0 0 0 .75 1.14 1.25 1.25 0 0 0 1.38-.25l.05-.04a1.5 1.5 0 1 1 2.12 2.12l-.04.05a1.25 1.25 0 0 0-.25 1.38v.06a1.25 1.25 0 0 0 1.14.75h.15a1.5 1.5 0 1 1 0 3h-.08a1.25 1.25 0 0 0-1.14.75z"/></svg></button>
              </div>
            </div>

            
            <div className="b-chat">
              <div className="b-chat-head">
                <div className="b-newchat">
                  <svg viewBox="0 0 20 20" className="ic"><path d="M4 5.4h7M4 9.4h7M4 13.4h4.5"/><path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z"/></svg>
                  新对话
                </div>
                <div className="b-toolrow">
                  <button className="b-icon-btn" title="备忘录"><svg viewBox="0 0 20 20" className="ic"><rect x="3" y="2.8" width="14" height="14.4" rx="2.2"/><path d="M6.6 7h6.8M6.6 10.2h6.8M6.6 13.4h4"/></svg></button>
                  <button className="b-icon-btn" title="起名"><svg viewBox="0 0 20 20" className="ic"><path d="M3.4 5.4V3.6h12.2v1.8M9 3.8v12.4M6.6 16.4h4.8"/></svg></button>
                  <button className="b-icon-btn" title="蒸馏"><svg viewBox="0 0 20 20" className="ic"><path d="M8.4 2.8h3.2M9 2.8v4L4.6 15a1.6 1.6 0 0 0 1.4 2.4h8a1.6 1.6 0 0 0 1.4-2.4L11 6.8v-4"/><path d="M6.4 12.4h7.2"/></svg></button>
                  <button className="b-icon-btn" title="拆解"><svg viewBox="0 0 20 20" className="ic"><rect x="3" y="3" width="14" height="14" rx="2.2"/><path d="M6.6 7.2h6.8M6.6 10.4h6.8M6.6 13.6h4"/></svg></button>
                  <button className="b-icon-btn" title="扫榜"><svg viewBox="0 0 20 20" className="ic"><path d="M4 16.6V9.4M9 16.6V4.6M14 16.6v-5"/><path d="M3 16.6h14"/></svg></button>
                </div>
                <div className="b-booklbl">
                  <svg viewBox="0 0 20 20" className="ic"><path d="M2.8 4.4A1.6 1.6 0 0 1 4.4 2.8h3.2c.9 0 1.6.7 1.6 1.6v11.4a1.2 1.2 0 0 0-1.2-1.2H2.8V4.4z"/><path d="M17.2 4.4a1.6 1.6 0 0 0-1.6-1.6h-3.2c-.9 0-1.6.7-1.6 1.6v11.4a1.2 1.2 0 0 1 1.2-1.2h5.2V4.4z"/></svg>
                  测试书籍
                </div>
              </div>

              <div className="b-chips">
                <button className="chip"><svg viewBox="0 0 20 20" className="ic"><circle cx="9" cy="9" r="5.4"/><path d="M13 13l3.6 3.6"/></svg>搜索</button>
                <button className="chip"><svg viewBox="0 0 20 20" className="ic"><rect x="2.8" y="3.6" width="14.4" height="12.8" rx="2.2"/><path d="M6.4 8l2.2 2.4-2.2 2.4M10.8 12.8h3"/></svg>终端</button>
              </div>

              
              <div className="b-hero">
                <div className="b-hero-logo"><img src={logo} alt="" />
                </div>
                <h2>writerD</h2>
                <p>AI 小说与写作助手</p>
                <div className="b-hero-actions">
                  <button className="hbtn"><svg viewBox="0 0 20 20" className="ic"><path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z"/><path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z"/></svg>新书启航</button>
                  <button className="hbtn"><svg viewBox="0 0 20 20" className="ic"><path d="M4 5.4h7M4 9.4h7M4 13.4h4.5"/><path d="M13.9 13.3l2.6-2.6 1.1 1.1-2.6 2.6-1.5.4.4-1.5z"/></svg>继续写作</button>
                  <button className="hbtn"><svg viewBox="0 0 20 20" className="ic"><path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h4.2c.9 0 1.6.7 1.6 1.6v11.2a1.2 1.2 0 0 0-1.2-1.2H3V4.6z"/><path d="M17 4.6A1.6 1.6 0 0 0 15.4 3h-4.2c-.9 0-1.6.7-1.6 1.6v11.2a1.2 1.2 0 0 1 1.2-1.2H17V4.6z"/></svg>使用教程</button>
                </div>
              </div>

              <div className="b-prechips">
                <button className="pchip"><svg viewBox="0 0 20 20" className="ic"><circle cx="9" cy="9" r="5.4"/><path d="M13 13l3.6 3.6"/></svg>搜索</button>
                <button className="pchip"><svg viewBox="0 0 20 20" className="ic"><rect x="2.8" y="3.6" width="14.4" height="12.8" rx="2.2"/><path d="M6.4 8l2.2 2.4-2.2 2.4M10.8 12.8h3"/></svg>终端</button>
              </div>
              <button className="b-quick" title="提示">
                <svg viewBox="0 0 20 20" className="ic"><path d="M10 2.6l1.9 5.2 5.2 1.9-5.2 1.9L10 16.8l-1.9-5.2L2.9 9.7l5.2-1.9L10 2.6z" className="ic-fill" stroke="none"/></svg>
              </button>

              
              <div className="b-tabstrip">
                <div className="b-tab">
                  <svg viewBox="0 0 16 16" className="ic-14"><path d="M3.6 1.6h5.2l3.6 3.6v9.2H3.6z" fill="#5B9BFF" stroke="none"/><path d="M8.8 1.6v3.6h3.6" fill="#2F6BB5" stroke="none"/></svg>
                  <span className="nm">章节摘要.md</span>
                  <svg viewBox="0 0 12 12" className="x" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6"/></svg>
                </div>
                <div className="b-tab">
                  <svg viewBox="0 0 16 16" className="ic-14"><path d="M3.6 1.6h5.2l3.6 3.6v9.2H3.6z" fill="#5B9BFF" stroke="none"/><path d="M8.8 1.6v3.6h3.6" fill="#2F6BB5" stroke="none"/></svg>
                  <span className="nm">人物库.md</span>
                  <svg viewBox="0 0 12 12" className="x" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6"/></svg>
                </div>
                <div className="b-tab on">
                  <svg viewBox="0 0 16 16" className="ic-14"><path d="M3.6 1.6h5.2l3.6 3.6v9.2H3.6z" fill="#5B9BFF" stroke="none"/><path d="M8.8 1.6v3.6h3.6" fill="#2F6BB5" stroke="none"/></svg>
                  <span className="nm">世界观.md</span>
                  <svg viewBox="0 0 12 12" className="x" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6"/></svg>
                </div>
              </div>
              <div className="b-editor">
                <div className="b-editor-body">
                  <h1><span className="hash">#</span>世界观</h1>
                </div>
              </div>

              
              <div className="b-composer">
                <div className="b-placeholder">写下你的故事…</div>
                <div className="b-comp-row">
                  <button className="cbtn skill"><svg viewBox="0 0 20 20" className="ic"><circle cx="10" cy="10" r="6.8"/><circle cx="10" cy="10" r="2.4"/></svg>@技能</button>
                  <button className="cbtn file"><svg viewBox="0 0 20 20" className="ic"><path d="M4.6 2.6h6.2l4 4v10.8H4.6z"/><path d="M10.8 2.6v4h4"/></svg>#文件</button>
                  <button className="cbtn plain"><svg viewBox="0 0 20 20" className="ic"><path d="M2.6 10.4A7.4 7.4 0 1 1 10 18a7.2 7.2 0 0 1-3.6-.95L2.6 18l1.1-3.6A7.4 7.4 0 0 1 2.6 10.4z"/></svg>默认</button>
                  <button className="cbtn model">
                    <svg viewBox="0 0 16 16" className="ic"><path d="M8 1.6c2.6 3.3 3.9 5.6 3.9 7.1A3.9 3.9 0 0 1 8 12.6a3.9 3.9 0 0 1-3.9-3.9c0-1.5 1.3-3.8 3.9-7.1z" fill="currentColor" stroke="none"/><path d="M4.6 14.6h6.8"/></svg>
                    openwrite/deepseek-v4-pro
                    <svg viewBox="0 0 12 12" className="arrow" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 6h6.4M6.2 3.2L9 6l-2.8 2.8"/></svg>
                  </button>
                  <button className="b-dice" title="随机">
                    <svg viewBox="0 0 20 20" className="ic"><rect x="3" y="3" width="14" height="14" rx="3"/><circle cx="7.4" cy="7.4" r="1.1" className="ic-fill" stroke="none"/><circle cx="12.6" cy="12.6" r="1.1" className="ic-fill" stroke="none"/><circle cx="10" cy="10" r="1.1" className="ic-fill" stroke="none"/></svg>
                  </button>
                  <button className="b-send" title="发送">
                    <svg viewBox="0 0 24 24" className="ic"><path d="M3.4 11.2L20.4 3.2l-7.8 17-2.2-6.8-7-2.2z" fill="currentColor" stroke="none"/></svg>
                  </button>
                </div>
              </div>

              <div className="b-status"><span>文章总字数：4 字</span></div>
            </div>

            
            <div className="b-right">
              <div className="b-right-head">
                <svg viewBox="0 0 20 20" className="ic"><path d="M2.8 5.2A1.6 1.6 0 0 1 4.4 3.6h3.2l1.4 1.8h6.6a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.2z"/></svg>
                <div className="ttl">目录</div>
                <button className="b-icon-btn" title="自动滚动"><svg viewBox="0 0 20 20" className="ic"><circle cx="10" cy="10" r="2"/><path d="M10 2.6v3.2M10 14.2v3.2M2.6 10h3.2M14.2 10h3.2M4.7 4.7l2.2 2.2M13.1 13.1l2.2 2.2M15.3 4.7l-2.2 2.2M6.9 13.1l-2.2 2.2"/></svg></button>
                <button className="b-icon-btn" title="搜索"><svg viewBox="0 0 20 20" className="ic"><circle cx="9" cy="9" r="5.4"/><path d="M13 13l3.6 3.6"/></svg></button>
                <button className="b-icon-btn" title="折叠"><svg viewBox="0 0 20 20" className="ic"><path d="M10 16.4V5.2M6.4 8.8L10 5.2l3.6 3.6"/></svg></button>
                <button className="b-icon-btn" title="刷新"><svg viewBox="0 0 20 20" className="ic"><path d="M16.4 10a6.4 6.4 0 1 1-1.9-4.6"/><path d="M16.6 3.4v3.4h-3.4"/></svg></button>
                <button className="b-icon-btn" title="清空"><svg viewBox="0 0 20 20" className="ic"><path d="M4.4 5.6h11.2M8 5.6V3.9h4v1.7M6.2 5.6l.7 10.1h6.2l.7-10.1"/></svg></button>
              </div>

              <button className="b-booksel">
                <svg viewBox="0 0 20 20" className="ic"><path d="M3 4.6A1.6 1.6 0 0 1 4.6 3h5.8l4.6 4.6v8.8A1.6 1.6 0 0 1 13.4 18H4.6A1.6 1.6 0 0 1 3 16.4V4.6z"/></svg>
                测试书籍
                <svg viewBox="0 0 12 12" className="uc" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.2L6 4.2l3 3M3 4.6L6 7.6l3-3" opacity=".9"/></svg>
              </button>
              <div className="b-div"></div>

              <div className="tree">
                <button className="tnode grp">
                  <svg viewBox="0 0 12 12" className="caret" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5l3-3"/></svg>
                  <svg viewBox="0 0 20 20" className="ic folder"><path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z"/></svg>
                  小说资料
                </button>
                <button className="tnode on"><svg viewBox="0 0 20 20" className="ic doc"><path d="M5 2.6h6.4l3.6 3.6v11.2H5z"/><path d="M11.4 2.6v3.6H15"/></svg>世界观.md</button>
                <button className="tnode sub"><svg viewBox="0 0 20 20" className="ic doc"><path d="M5 2.6h6.4l3.6 3.6v11.2H5z"/><path d="M11.4 2.6v3.6H15"/></svg>人物库.md</button>
                <button className="tnode sub"><svg viewBox="0 0 20 20" className="ic doc"><path d="M5 2.6h6.4l3.6 3.6v11.2H5z"/><path d="M11.4 2.6v3.6H15"/></svg>章节摘要.md</button>
                <button className="tnode grp">
                  <svg viewBox="0 0 12 12" className="caret" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5l3-3"/></svg>
                  <svg viewBox="0 0 20 20" className="ic folder"><path d="M2.8 5.4A1.6 1.6 0 0 1 4.4 3.8h3l1.4 1.8h6.8a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V5.4z"/></svg>
                  章节内容
                </button>
                <button className="tnode sub"><svg viewBox="0 0 20 20" className="ic doc"><path d="M5 2.6h6.4l3.6 3.6v11.2H5z"/><path d="M11.4 2.6v3.6H15"/></svg>1.md</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div></>
  );
}
